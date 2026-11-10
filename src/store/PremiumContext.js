// Premium state: a 7-day free trial followed by the Myket / Cafe Bazaar
// in-app purchase. Persisted in AsyncStorage (`@premium_trial` + `@premium_state`)
// so a restart never restarts the countdown.
//
// Reinstall note: AsyncStorage lives in the app's private data, which Android
// deletes on uninstall. The trial is kept across a reinstall by Android Auto
// Backup (`android.allowBackup` is true in app.json) restoring that data — the
// only client-side mechanism that exists without a server. On top of it,
// `lastSeenAt` is persisted so rolling the phone clock back cannot reopen an
// expired trial.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BILLING_READY, purchasePremium, restorePremium } from '../utils/billing';
import { DAY_MS, trialInfo } from '../utils/trial';

const PREMIUM_KEY = '@premium_state';
const TRIAL_KEY = '@premium_trial';
const SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000; // persist "last seen" at most every 5 min
const TICK_MS = 60 * 1000;

const PremiumContext = createContext(null);

function readJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function PremiumProvider({ children }) {
  const [premium, setPremium] = useState(false);
  const [trialStartedAt, setTrialStartedAt] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const persistedSeenRef = useRef(0);

  // ── hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stamp = Date.now();
      let start = 0;
      let seen = 0;

      try {
        const [premiumRaw, trialRaw] = await Promise.all([
          AsyncStorage.getItem(PREMIUM_KEY),
          AsyncStorage.getItem(TRIAL_KEY),
        ]);
        if (cancelled) return;

        const premiumState = readJson(premiumRaw);
        if (premiumState && premiumState.premium === true) setPremium(true);

        const trialState = readJson(trialRaw) || {};
        start = Number(trialState.startedAt) || 0;
        seen = Number(trialState.lastSeenAt) || 0;

        // First launch ever → the countdown starts now.
        if (!start) start = stamp;
        // Never let a backwards clock move the trial window.
        const seenNow = Math.max(seen, stamp);

        setTrialStartedAt(start);
        setLastSeenAt(seenNow);
        persistedSeenRef.current = seenNow;
        setNow(stamp);

        if (!trialRaw || seenNow !== seen) {
          AsyncStorage.setItem(
            TRIAL_KEY,
            JSON.stringify({ startedAt: start, lastSeenAt: seenNow }),
          ).catch(() => {});
        }
      } catch (error) {
        console.warn('Failed to load premium state', error);
        // Storage unavailable: still give the user a working 7-day session.
        if (!cancelled) {
          setTrialStartedAt(stamp);
          setLastSeenAt(stamp);
          persistedSeenRef.current = stamp;
          setNow(stamp);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── clock: re-render the countdown and remember the latest time seen ──────
  useEffect(() => {
    if (!hydrated) return undefined;

    const tick = () => {
      const stamp = Date.now();
      setNow(stamp);
      if (stamp - persistedSeenRef.current > SEEN_WRITE_INTERVAL_MS) {
        persistedSeenRef.current = stamp;
        setLastSeenAt(stamp);
        AsyncStorage.setItem(
          TRIAL_KEY,
          JSON.stringify({ startedAt: trialStartedAt, lastSeenAt: stamp }),
        ).catch(() => {});
      }
    };

    const timer = setInterval(tick, TICK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [hydrated, trialStartedAt]);

  // ── purchase ──────────────────────────────────────────────────────────────
  const unlock = useCallback(async (source = 'demo') => {
    setPremium(true);
    AsyncStorage.setItem(
      PREMIUM_KEY,
      JSON.stringify({ premium: true, source, at: new Date().toISOString() }),
    ).catch(() => {});
  }, []);

  const lock = useCallback(async () => {
    setPremium(false);
    AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify({ premium: false })).catch(() => {});
  }, []);

  /** Store purchase. Returns { ok, reason }. */
  const buy = useCallback(async () => {
    setBusy(true);
    try {
      const result = await purchasePremium();
      if (result.ok) await unlock('myket');
      return result;
    } finally {
      setBusy(false);
    }
  }, [unlock]);

  /** Restore a previous purchase. Returns { ok, reason }. */
  const restore = useCallback(async () => {
    setBusy(true);
    try {
      const result = await restorePremium();
      if (result.ok) await unlock('restore');
      return result;
    } finally {
      setBusy(false);
    }
  }, [unlock]);

  /**
   * DEV ONLY — move the trial start into the past to test the paywall.
   * The button that calls it is wrapped in `__DEV__`, so it never ships.
   */
  const debugShiftTrial = useCallback(async (days = 8) => {
    const stamp = Date.now();
    const start = stamp - days * DAY_MS;
    setTrialStartedAt(start);
    setLastSeenAt(stamp);
    persistedSeenRef.current = stamp;
    setNow(stamp);
    await AsyncStorage.setItem(
      TRIAL_KEY,
      JSON.stringify({ startedAt: start, lastSeenAt: stamp }),
    ).catch(() => {});
  }, []);

  const trial = useMemo(
    () => trialInfo(trialStartedAt, Math.max(now, lastSeenAt)),
    [trialStartedAt, now, lastSeenAt],
  );

  const hasAccess = premium || trial.active;
  const locked = !premium && trial.started && trial.expired;

  const value = useMemo(
    () => ({
      premium,
      hydrated,
      busy,
      billingReady: BILLING_READY,
      trial,
      trialActive: !premium && trial.active,
      trialDaysLeft: trial.daysLeft,
      trialEndsAt: trial.endsAt,
      hasAccess,
      /** true when the trial is over and no purchase restored it. */
      locked,
      /** Kept for old call sites: access, not customer count, is the gate now. */
      isLimitReached: () => locked,
      buy,
      restore,
      unlock,
      lock,
      debugShiftTrial,
    }),
    [
      premium,
      hydrated,
      busy,
      trial,
      hasAccess,
      locked,
      buy,
      restore,
      unlock,
      lock,
      debugShiftTrial,
    ],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside PremiumProvider');
  return ctx;
}
