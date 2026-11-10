// Automatic bank-SMS → payment pipeline.
//
// The native module (modules/sms-reader) queues every incoming SMS, including
// while the app is closed. This provider drains that queue, parses deposits and
// records a payment for the matching customer:
//   - high confidence (saved card last-4 or full name in the text) → automatic
//   - low / no match → kept in `pending` for a one-tap confirmation
//
// In Expo Go the native module is missing, so `available` is false and the app
// falls back to the manual paste flow without crashing.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as nativeSms from '../../modules/sms-reader';
import { TRANSACTION, useContacts } from './ContactsContext';
import { useSettings } from './SettingsContext';
import { digitsOf, matchSms, smsKey } from '../utils/smsMatch';

const ENABLED_KEY = '@sms_auto_enabled';
const PENDING_KEY = '@sms_pending_items';
const SEEN_KEY = '@sms_seen_keys';
const LAST_SCAN_KEY = '@sms_last_scan';

const FIRST_SCAN_WINDOW_MS = 6 * 60 * 60 * 1000; // last 6 hours
const MAX_SEEN = 300;
const MAX_PENDING = 50;

const SmsInboxContext = createContext(null);

function isBankDeposit(parsed) {
  // Ignore personal SMS entirely: a real bank message always carries a bank
  // name or a masked card number.
  return parsed.ok && parsed.direction !== 'out' && (!!parsed.bank || !!parsed.card);
}

export function SmsInboxProvider({ children }) {
  const { contacts, hydrated, addTransaction } = useContacts();
  const { settings } = useSettings();
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const ownCardRef = useRef('');
  ownCardRef.current = digitsOf(settings.cardNumber).slice(-4);

  const available = nativeSms.isAvailable && Platform.OS === 'android';

  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('unknown');
  const [pending, setPending] = useState([]);
  const [recentAuto, setRecentAuto] = useState([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const seenRef = useRef([]);
  const lastScanRef = useRef(Date.now() - FIRST_SCAN_WINDOW_MS);
  const runningRef = useRef(false);

  // ── hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [enabledRaw, pendingRaw, seenRaw, lastScanRaw] = await Promise.all([
          AsyncStorage.getItem(ENABLED_KEY),
          AsyncStorage.getItem(PENDING_KEY),
          AsyncStorage.getItem(SEEN_KEY),
          AsyncStorage.getItem(LAST_SCAN_KEY),
        ]);
        if (cancelled) return;
        setEnabled(enabledRaw === '1');
        if (pendingRaw) {
          const parsedPending = JSON.parse(pendingRaw);
          if (Array.isArray(parsedPending)) setPending(parsedPending);
        }
        if (seenRaw) {
          const parsedSeen = JSON.parse(seenRaw);
          if (Array.isArray(parsedSeen)) seenRef.current = parsedSeen;
        }
        if (lastScanRaw) {
          const stamp = Number(lastScanRaw);
          if (Number.isFinite(stamp) && stamp > 0) lastScanRef.current = stamp;
        }
      } catch (error) {
        console.warn('Failed to load SMS automation state', error);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the pending queue whenever it changes.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending)).catch(() => {});
  }, [pending, ready]);

  const persistSeen = useCallback(() => {
    const trimmed = seenRef.current.slice(-MAX_SEEN);
    seenRef.current = trimmed;
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify(trimmed)).catch(() => {});
    AsyncStorage.setItem(LAST_SCAN_KEY, String(lastScanRef.current)).catch(() => {});
  }, []);

  const recordPayment = useCallback(
    (item, customer) => {
      addTransaction(customer.id, {
        type: TRANSACTION.PAYMENT,
        amount: String(item.amount ?? item.amountToman ?? '0'),
        note: item.bank ? `پیامک ${item.bank}` : 'پیامک بانکی',
      });
    },
    [addTransaction],
  );

  // ── scan ──────────────────────────────────────────────────────────────────
  const scanNow = useCallback(async () => {
    if (!available || runningRef.current) {
      return { auto: 0, pending: 0, needsPermission: false };
    }
    runningRef.current = true;
    setBusy(true);
    try {
      const canReceive = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      );
      const canRead = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      );
      setPermission(canReceive ? 'granted' : 'denied');
      if (!canReceive) {
        return { auto: 0, pending: 0, needsPermission: true };
      }

      const live = await nativeSms.getPendingSms();
      const inbox = canRead ? await nativeSms.readInbox(lastScanRef.current, 100) : [];
      const seen = new Set(seenRef.current);
      const fresh = [];
      for (const sms of [...live, ...inbox]) {
        if (!sms || !sms.body) continue;
        const key = smsKey(sms);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        seenRef.current.push(key);
        fresh.push({ ...sms, key });
      }

      const auto = [];
      const queued = [];
      for (const sms of fresh) {
        const result = matchSms(sms, contactsRef.current, {
          ignoreCardLast4: ownCardRef.current,
        });
        if (!isBankDeposit(result.parsed)) continue; // not a deposit → ignore

        const item = {
          id: sms.id,
          key: sms.key,
          address: sms.address || '',
          body: sms.body,
          timestamp: sms.timestamp || Date.now(),
          amount: result.parsed.amount,
          card: result.parsed.card || null,
          bank: result.parsed.bank || null,
          confidence: result.confidence,
          reason: result.reason,
          candidateIds: (result.candidates || []).map((c) => c.id),
        };

        if (result.confidence === 'high' && result.match) {
          recordPayment(item, result.match);
          auto.push({
            id: sms.id,
            name: result.match.name,
            amount: item.amount,
            at: Date.now(),
          });
        } else {
          queued.push(item);
        }
      }

      if (auto.length) {
        setRecentAuto((prev) => [...auto, ...prev].slice(0, 10));
      }

      if (queued.length) {
        setPending((prev) => {
          const byKey = new Set(prev.map((item) => item.key));
          const additions = queued.filter((item) => !byKey.has(item.key));
          return [...additions, ...prev].slice(0, MAX_PENDING);
        });
      }

      // The JS side now owns these messages: free the native queue.
      if (live.length) {
        await nativeSms.clearPendingSms(live.map((sms) => sms.id));
      }

      const newest = fresh.reduce(
        (max, sms) => Math.max(max, Number(sms.timestamp) || 0),
        0,
      );
      lastScanRef.current = Math.max(lastScanRef.current, newest, Date.now() - 60000);
      persistSeen();

      return { auto: auto.length, pending: queued.length, needsPermission: false };
    } catch (error) {
      console.warn('SMS scan failed', error);
      return { auto: 0, pending: 0, needsPermission: false };
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [available, persistSeen, recordPayment]);

  // Check permission + first scan once everything (contacts included) is loaded.
  useEffect(() => {
    if (!ready || !hydrated) return;
    let cancelled = false;
    (async () => {
      if (!available) {
        setPermission('unavailable');
        return;
      }
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      );
      if (cancelled) return;
      setPermission(granted ? 'granted' : 'unknown');
      if (granted && enabled) {
        await scanNow();
      }
    })();
    return () => {
      cancelled = true;
    };
    // scanNow is stable apart from `available`; re-running on every contact
    // change would be wasteful, so it is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hydrated, available, enabled]);

  // Live SMS while the app is open.
  useEffect(() => {
    if (!available || !enabled) return undefined;
    const subscription = nativeSms.addSmsListener(() => {
      scanNow();
    });
    return () => subscription.remove();
  }, [available, enabled, scanNow]);

  // Coming back to the app after a while: drain what arrived in background.
  useEffect(() => {
    if (!available || !enabled) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scanNow();
    });
    return () => subscription.remove();
  }, [available, enabled, scanNow]);

  // ── actions ───────────────────────────────────────────────────────────────
  const enable = useCallback(async () => {
    if (!available) {
      return { ok: false, reason: 'unavailable', readAllowed: false };
    }
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);
    const receiveOk =
      results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const readOk =
      results[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;
    setPermission(receiveOk ? 'granted' : 'denied');
    if (!receiveOk) {
      return { ok: false, reason: 'denied', readAllowed: readOk };
    }
    setEnabled(true);
    await AsyncStorage.setItem(ENABLED_KEY, '1');
    await scanNow();
    return { ok: true, reason: null, readAllowed: readOk };
  }, [available, scanNow]);

  const disable = useCallback(async () => {
    setEnabled(false);
    await AsyncStorage.setItem(ENABLED_KEY, '0');
  }, []);

  const recordPending = useCallback(
    (pendingId, contactId) => {
      const item = pending.find((entry) => entry.id === pendingId);
      const customer = contacts.find((entry) => entry.id === contactId);
      if (!item || !customer) return false;
      recordPayment(item, customer);
      setPending((prev) => prev.filter((entry) => entry.id !== pendingId));
      return true;
    },
    [pending, contacts, recordPayment],
  );

  const dismissPending = useCallback((pendingId) => {
    setPending((prev) => prev.filter((entry) => entry.id !== pendingId));
  }, []);

  const clearRecentAuto = useCallback(() => setRecentAuto([]), []);

  const value = useMemo(
    () => ({
      available,
      enabled,
      permission,
      pending,
      recentAuto,
      busy,
      enable,
      disable,
      scanNow,
      recordPending,
      dismissPending,
      clearRecentAuto,
    }),
    [
      available,
      enabled,
      permission,
      pending,
      recentAuto,
      busy,
      enable,
      disable,
      scanNow,
      recordPending,
      dismissPending,
      clearRecentAuto,
    ],
  );

  return <SmsInboxContext.Provider value={value}>{children}</SmsInboxContext.Provider>;
}

export function useSmsInbox() {
  const ctx = useContext(SmsInboxContext);
  if (!ctx) throw new Error('useSmsInbox must be used inside SmsInboxProvider');
  return ctx;
}
