// Customer categories ("profiles"): فروشگاه / شخصی / هر دسته دلخواه.
// A profile is just { id, name }; every customer stores `profileId` ('' = بدون دسته).
// Kept in its own context + storage key so renaming or deleting a category never
// touches the transactions of its customers.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanProfileName, isDuplicateProfile } from '../utils/profiles';

const STORAGE_KEY = '@customer_profiles';

// Seeded once, on the very first launch, so the feature is usable immediately.
// Deleting them is allowed and never re-seeds (the stored array stays as `[]`).
const SEED_PROFILES = ['فروشگاه', 'شخصی'];

const ProfilesContext = createContext(null);

function normalizeProfile(p, index) {
  const name = cleanProfileName(p && p.name);
  return {
    id: p && p.id ? String(p.id) : `p-${Date.now()}-${index}`,
    name,
    createdAt: (p && p.createdAt) || null,
  };
}

export function ProfilesProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;

        if (raw === null) {
          // First launch: seed the two everyday categories.
          const stamp = new Date().toISOString();
          const seeded = SEED_PROFILES.map((name, index) =>
            normalizeProfile({ id: `p-${Date.now()}-${index}`, name, createdAt: stamp }, index),
          );
          setProfiles(seeded);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
          return;
        }

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setProfiles(
            parsed
              .map(normalizeProfile)
              .filter((p) => p.name.length > 0),
          );
        }
      } catch (error) {
        console.warn('Failed to load profiles', error);
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
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)).catch((error) =>
      console.warn('Failed to save profiles', error),
    );
  }, [profiles, hydrated]);

  /** Returns { ok: true, profile } or { ok: false, reason: 'empty'|'duplicate' }. */
  const addProfile = useCallback(
    (name) => {
      const clean = cleanProfileName(name);
      if (!clean) return { ok: false, reason: 'empty' };
      if (isDuplicateProfile(profiles, clean)) return { ok: false, reason: 'duplicate' };

      const profile = normalizeProfile(
        { id: `p-${Date.now()}`, name: clean, createdAt: new Date().toISOString() },
        0,
      );
      // Re-check inside the updater so a double tap can never create a twin.
      setProfiles((prev) =>
        isDuplicateProfile(prev, clean) ? prev : [...prev, profile],
      );
      return { ok: true, profile };
    },
    [profiles],
  );

  /** Returns { ok: true } or { ok: false, reason: 'empty'|'duplicate'|'missing' }. */
  const updateProfile = useCallback(
    (id, name) => {
      const clean = cleanProfileName(name);
      if (!clean) return { ok: false, reason: 'empty' };
      if (!profiles.some((p) => p.id === id)) return { ok: false, reason: 'missing' };
      if (isDuplicateProfile(profiles, clean, id)) return { ok: false, reason: 'duplicate' };

      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name: clean } : p)));
      return { ok: true };
    },
    [profiles],
  );

  const deleteProfile = useCallback((id) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /**
   * Bulk replace (backup restore). Rows are normalized; invalid names drop out
   * instead of crashing the app. Returns the imported count.
   */
  const importProfiles = useCallback((list) => {
    const rows = (Array.isArray(list) ? list : [])
      .map(normalizeProfile)
      .filter((p) => p.name.length > 0);
    setProfiles(rows);
    return rows.length;
  }, []);

  const profileById = useCallback(
    (id) => profiles.find((p) => p.id === id) || null,
    [profiles],
  );

  const value = useMemo(
    () => ({
      profiles,
      hydrated,
      addProfile,
      updateProfile,
      deleteProfile,
      importProfiles,
      profileById,
    }),
    [profiles, hydrated, addProfile, updateProfile, deleteProfile, importProfiles, profileById],
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext);
  if (!ctx) throw new Error('useProfiles must be used inside ProfilesProvider');
  return ctx;
}
