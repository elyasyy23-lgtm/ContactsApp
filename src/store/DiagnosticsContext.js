import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  appendLog,
  createLogEntry,
  DIAGNOSTICS_STORAGE_KEY,
  LOG_LEVELS,
  mergeLogs,
  normalizeStoredLogs,
} from '../utils/diagnostics';

const CctvDiagnosticsContext = createContext(null);
const CctvDiagnosticsActionsContext = createContext(null);

export function CctvDiagnosticsProvider({ children }) {
  const [logs, setLogs] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const logsRef = useRef([]);
  const hydratedRef = useRef(false);
  const writeQueueRef = useRef(Promise.resolve());
  const clearedRef = useRef(false);

  const updateLogs = useCallback((next) => {
    logsRef.current = next;
    setLogs(next);
  }, []);

  const persistLogs = useCallback((next) => {
    writeQueueRef.current = writeQueueRef.current
      .then(() => AsyncStorage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(next)))
      .catch(() => {
        // Diagnostics must never break the app when storage is unavailable.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // A clear tapped before hydration must win over old stored logs.
        const raw = clearedRef.current ? null : await AsyncStorage.getItem(DIAGNOSTICS_STORAGE_KEY);
        const restored = raw ? normalizeStoredLogs(JSON.parse(raw)) : [];
        if (cancelled) return;
        const pending = logsRef.current;
        const merged = mergeLogs(pending, restored);
        updateLogs(merged);
        if (clearedRef.current) {
          // Make the clear durable so a later launch cannot resurrect old logs.
          writeQueueRef.current = writeQueueRef.current
            .then(() => AsyncStorage.removeItem(DIAGNOSTICS_STORAGE_KEY))
            .catch(() => {});
        } else if (pending.length) {
          persistLogs(merged);
        }
      } catch (error) {
        if (!cancelled) console.warn('Diagnostics hydrate failed', error);
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistLogs, updateLogs]);

  const log = useCallback(
    (section, level, message, detail) => {
      const entry = createLogEntry({ section, level, message, detail });
      const next = appendLog(logsRef.current, entry);
      updateLogs(next);
      if (hydratedRef.current) persistLogs(next);
      return entry;
    },
    [persistLogs, updateLogs],
  );

  const logInfo = useCallback(
    (section, message, detail) => log(section, LOG_LEVELS.INFO, message, detail),
    [log],
  );

  const logWarning = useCallback(
    (section, message, detail) => log(section, LOG_LEVELS.WARNING, message, detail),
    [log],
  );

  const logError = useCallback(
    (section, message, detail) => log(section, LOG_LEVELS.ERROR, message, detail),
    [log],
  );

  const clearLogs = useCallback(() => {
    // Remember the intent even before hydration finishes; the hydrate effect
    // checks this so old stored logs cannot reappear after a fast clear.
    clearedRef.current = true;
    updateLogs([]);
    writeQueueRef.current = writeQueueRef.current
      .then(() => AsyncStorage.removeItem(DIAGNOSTICS_STORAGE_KEY))
      .catch(() => {
        // Ignore storage failures; in-memory logs are already cleared.
      });
  }, [updateLogs]);

  const actions = useMemo(
    () => ({
      log,
      logInfo,
      logWarning,
      logError,
      clearLogs,
    }),
    [clearLogs, log, logError, logInfo, logWarning],
  );

  const value = useMemo(
    () => ({
      logs,
      hydrated,
      ...actions,
    }),
    [actions, hydrated, logs],
  );

  return (
    <CctvDiagnosticsActionsContext.Provider value={actions}>
      <CctvDiagnosticsContext.Provider value={value}>{children}</CctvDiagnosticsContext.Provider>
    </CctvDiagnosticsActionsContext.Provider>
  );
}

export function useCctvDiagnostics() {
  const context = useContext(CctvDiagnosticsContext);
  if (!context) {
    throw new Error('useCctvDiagnostics must be used inside CctvDiagnosticsProvider');
  }
  return context;
}

export function useCctvDiagnosticsActions() {
  const context = useContext(CctvDiagnosticsActionsContext);
  if (!context) {
    throw new Error('useCctvDiagnosticsActions must be used inside CctvDiagnosticsProvider');
  }
  return context;
}
