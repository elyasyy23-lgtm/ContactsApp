// App language provider: persists the choice and keeps the module-level
// translator + the date/number locale in format.js in sync.
//
// Layout never flips: the UI stays RTL in both languages (owner decision — the
// app is a Persian-first ledger and English text reads fine inside the same
// row-reverse layout). Only words, digits and date calendar change.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLang, setLang as setModuleLang } from './index';
import { setLocale } from '../utils/format';

export const LANGUAGE_KEY = '@app_language';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getLang());
  const [ready, setReady] = useState(false);

  // Hydrate once. Until it resolves the app runs in fa, which is the default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (cancelled) return;
        const next = stored === 'en' ? 'en' : 'fa';
        setModuleLang(next);
        setLocale(next);
        setLangState(next);
      } catch (error) {
        console.warn('Failed to load language', error);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLang = useCallback(async (next) => {
    const value = next === 'en' ? 'en' : 'fa';
    setModuleLang(value);
    setLocale(value);
    setLangState(value);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, value);
    } catch (error) {
      console.warn('Failed to save language', error);
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang, isEn: lang === 'en', ready }), [lang, setLang, ready]);

  // Nothing renders before the stored language is known: mounting the tree in
  // fa and then swapping it would flash Persian text for English users.
  if (!ready) return null;

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Screens call this once at the top so they re-render on a language change. */
export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}
