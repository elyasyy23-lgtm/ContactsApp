// Premium state (Myket / Cafe Bazaar in-app purchase) + the free-plan cap.
// Persisted in AsyncStorage so an unlocked shop stays unlocked after a restart.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BILLING_READY, purchasePremium, restorePremium } from '../utils/billing';
import { FREE_CUSTOMER_LIMIT } from '../theme';

const STORAGE_KEY = '@premium_state';

const PremiumContext = createContext(null);

export function PremiumProvider({ children }) {
  const [premium, setPremium] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.premium === true) setPremium(true);
        }
      } catch (error) {
        console.warn('Failed to load premium state', error);
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ premium })).catch((error) =>
      console.warn('Failed to save premium state', error),
    );
  }, [premium, hydrated]);

  const unlock = useCallback(async (source = 'demo') => {
    setPremium(true);
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ premium: true, source, at: new Date().toISOString() }),
    ).catch(() => {});
  }, []);

  const lock = useCallback(async () => {
    setPremium(false);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ premium: false })).catch(() => {});
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

  const value = useMemo(
    () => ({
      premium,
      hydrated,
      busy,
      billingReady: BILLING_READY,
      freeLimit: FREE_CUSTOMER_LIMIT,
      buy,
      restore,
      unlock,
      lock,
      /** true when one more customer would exceed the free plan. */
      isLimitReached: (count) => !premium && count >= FREE_CUSTOMER_LIMIT,
      remaining: (count) => (premium ? Infinity : Math.max(0, FREE_CUSTOMER_LIMIT - count)),
    }),
    [premium, hydrated, busy, buy, restore, unlock, lock],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside PremiumProvider');
  return ctx;
}
