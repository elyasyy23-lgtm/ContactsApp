// Shop settings used by the reminder message (my name, card number, shop name)
// plus locally stored CCTV/DVR connection settings.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@settings_data';

const EMPTY = {
  myName: '',
  cardNumber: '',
  shopName: '',
  appLock: false,
  // Weekly debt reminder. OFF until the owner opts in.
  // Configurable weekday (0=Sun..6=Sat), hour (0-23), minute (0-59). Defaults: Friday 10:00.
  weeklySmsEnabled: false,
  weeklyWeekday: 5,
  weeklyHour: 10,
  weeklyMinute: 0,
  // Phone numbers whose bank SMS the shop wants the app to ignore completely.
  // Empty by default: every sender is processed until the owner adds one.
  excludedSmsSenders: [],
  // Local CCTV/DVR archive settings. All values stay ASCII: IP is a plain
  // string, port is digits-only, username/password/serial are stored as typed.
  dvrIp: '',
  // DVRIP control port as configured on this DVR; RTSP video stays 554.
  dvrPort: '34567',
  rtspPort: '554',
  // Cameras 1-4 are active on the shop DVR (channels are 1-based over RTSP).
  dvrChannel: 1,
  dvrUser: 'admin',
  dvrPassword: '',
  dvrSerial: '292c3e41a34907d9',
};

const SettingsContext = createContext(null);

function normalize(raw) {
  return {
    myName: String(raw?.myName || '').trim(),
    cardNumber: String(raw?.cardNumber || '').replace(/[^\d]/g, ''),
    shopName: String(raw?.shopName || '').trim(),
    // Require fingerprint/PIN every time the app is opened (LockScreen gate).
    // The `reminderAutoSend` field was removed 2026-11-10 — reminders are
    // manual-only now (per-customer `reminderEnabled` on each contact).
    appLock: Boolean(raw?.appLock),
    weeklySmsEnabled: Boolean(raw?.weeklySmsEnabled),
    // Weekly schedule: weekday 0=Sun..6=Sat, hour 0-23, minute 0-59. Defaults Fri 10:00.
    weeklyWeekday: (() => {
      const n = Number(raw?.weeklyWeekday);
      if (!Number.isFinite(n) || n < 0 || n > 6) return EMPTY.weeklyWeekday;
      return Math.trunc(n);
    })(),
    weeklyHour: (() => {
      const n = Number(raw?.weeklyHour);
      if (!Number.isFinite(n) || n < 0 || n > 23) return EMPTY.weeklyHour;
      return Math.trunc(n);
    })(),
    weeklyMinute: (() => {
      const n = Number(raw?.weeklyMinute);
      if (!Number.isFinite(n) || n < 0 || n > 59) return EMPTY.weeklyMinute;
      return Math.trunc(n);
    })(),
    // Digits-only, trimmed, de-duplicated. Anything non-numeric is stripped so
    // "+98 912…", "0912…" and "912…" collapse to one entry.
    excludedSmsSenders: Array.isArray(raw?.excludedSmsSenders)
      ? [...new Set(raw.excludedSmsSenders.map((n) => String(n || '').replace(/\D/g, '')).filter(Boolean))]
      : [],
    dvrIp: String(raw?.dvrIp || '').trim(),
    dvrPort: String(raw?.dvrPort || EMPTY.dvrPort).replace(/\D/g, '').slice(0, 5) || EMPTY.dvrPort,
    rtspPort: String(raw?.rtspPort || EMPTY.rtspPort).replace(/\D/g, '').slice(0, 5) || EMPTY.rtspPort,
    dvrChannel: (() => {
      const n = Number(raw?.dvrChannel);
      if (!Number.isFinite(n) || n < 1) return EMPTY.dvrChannel;
      return Math.min(4, Math.trunc(n));
    })(),
    dvrUser: String(raw?.dvrUser || EMPTY.dvrUser).trim() || EMPTY.dvrUser,
    dvrPassword: String(raw?.dvrPassword || ''),
    dvrSerial: String(raw?.dvrSerial || EMPTY.dvrSerial).trim() || EMPTY.dvrSerial,
  };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) setSettings(normalize(JSON.parse(raw)));
      } catch (error) {
        console.warn('Failed to load settings', error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch((error) =>
      console.warn('Failed to save settings', error),
    );
  }, [settings, hydrated]);

  const saveSettings = useCallback((next) => {
    setSettings((prev) => normalize({ ...prev, ...next }));
  }, []);

  const value = useMemo(
    () => ({
      settings,
      hydrated,
      saveSettings,
      isComplete: Boolean(settings.myName && settings.cardNumber),
    }),
    [settings, hydrated, saveSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
