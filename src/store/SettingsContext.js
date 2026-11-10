// Shop settings used by the reminder message (my name, card number, shop name).
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
