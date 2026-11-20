// Pure helpers for the CCTV/DVR-only local diagnostics log. Nothing here imports
// React Native or native modules, so scripts/verify.js can exercise the real logic in Node.

export const DIAGNOSTICS_STORAGE_KEY = '@cctv_diagnostics_log_v1';
export const DIAGNOSTICS_MAX_LOGS = 300;
export const DIAGNOSTICS_MESSAGE_MAX = 300;
export const DIAGNOSTICS_DETAIL_MAX = 180;

export const LOG_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
};

// CCTV/DVR-only sections: keep this focused on the camera feature.
export const CCTV_LOG_SECTIONS = {
  CCTV: 'cctv',
  SETTINGS: 'settings',
  PLAYBACK: 'playback',
};

export const LOG_FILTER_ALL = 'all';

const LEVEL_SET = new Set(Object.values(LOG_LEVELS));
const SECTION_SET = new Set(Object.values(CCTV_LOG_SECTIONS));

const toAsciiDigits = (value) =>
  String(value)
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

/** Remove values that must never reach a log, even if a caller passes them by mistake. */
export function redactSensitive(value) {
  let text = toAsciiDigits(value ?? '');

  // Full RTSP URLs are never useful in diagnostics — the address/port/user can
  // identify the owner's LAN, and the password is a secret.
  text = text.replace(/rtsp:\/\/[^\s"'<>]+/gi, '[RTSP_REDACTED]');
  text = text.replace(/\b(?:https?|ftp):\/\/([^:@/]+):([^@/]*)@/gi, '$1:[CREDENTIALS_REDACTED]@');
  text = text.replace(
    /\b(?:password|passwd|pass|token|secret|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi,
    (match, secret) => match.replace(secret, '[REDACTED]'),
  );
  text = text.replace(/(رمز عبور|کلمه عبور|رمز)\s*[:=]\s*([^\s,;]+)/g, '$1: [REDACTED]');
  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, '[CARD_REDACTED]');
  text = text.replace(/\b(?:\+?98|0)?9\d{8,9}\b/g, '[PHONE_REDACTED]');

  return text;
}

/** One-line, sanitized text safe to store and display in the diagnostics screen. */
export function sanitizeLogText(value, maxLength = DIAGNOSTICS_MESSAGE_MAX) {
  if (value == null) return '';
  const limit = Math.max(1, Number(maxLength) || DIAGNOSTICS_MESSAGE_MAX);
  const text = redactSensitive(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function normalizeLogLevel(level) {
  const value = String(level || '').toUpperCase();
  return LEVEL_SET.has(value) ? value : LOG_LEVELS.INFO;
}

export function normalizeLogSection(section) {
  const value = String(section || '').toLowerCase().trim();
  return SECTION_SET.has(value) ? value : CCTV_LOG_SECTIONS.CCTV;
}

/** Create a sanitized entry. `now` is injectable for deterministic tests. */
export function createLogEntry({
  section,
  level,
  message,
  detail,
  now,
} = {}) {
  const supplied = now == null ? Date.now() : new Date(now).getTime();
  const atMs = Number.isFinite(supplied) ? supplied : Date.now();
  const at = new Date(atMs).toISOString();
  const id = `${at}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    at,
    section: normalizeLogSection(section),
    level: normalizeLogLevel(level),
    message: sanitizeLogText(message) || '-',
    detail: sanitizeLogText(detail, DIAGNOSTICS_DETAIL_MAX),
  };
}

/** Normalize untrusted data loaded from AsyncStorage. */
export function normalizeStoredLogs(raw, max = DIAGNOSTICS_MAX_LOGS) {
  if (!Array.isArray(raw)) return [];
  const limit = Math.max(1, Number(max) || DIAGNOSTICS_MAX_LOGS);
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const atMs = new Date(item.at).getTime();
      if (!Number.isFinite(atMs)) return null;
      return {
        id: sanitizeLogText(item.id, 80) || `${new Date(atMs).toISOString()}-restored`,
        at: new Date(atMs).toISOString(),
        section: normalizeLogSection(item.section),
        level: normalizeLogLevel(item.level),
        message: sanitizeLogText(item.message) || '-',
        detail: sanitizeLogText(item.detail, DIAGNOSTICS_DETAIL_MAX),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/** Newest-first append with a hard cap so storage never grows without bound. */
export function appendLog(logs, entry, max = DIAGNOSTICS_MAX_LOGS) {
  if (!entry) return normalizeStoredLogs(logs, max);
  const limit = Math.max(1, Number(max) || DIAGNOSTICS_MAX_LOGS);
  const next = [entry, ...normalizeStoredLogs(logs, limit).filter((item) => item.id !== entry.id)];
  return next.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}

/** Combine pre-hydration entries with restored entries without losing either. */
export function mergeLogs(...groups) {
  const all = groups.flatMap((group) => normalizeStoredLogs(group, DIAGNOSTICS_MAX_LOGS));
  const seen = new Set();
  return all
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, DIAGNOSTICS_MAX_LOGS);
}

export function filterLogs(logs, { section, level } = {}) {
  const wantedSection = section && section !== LOG_FILTER_ALL ? normalizeLogSection(section) : null;
  const wantedLevel = level && level !== LOG_FILTER_ALL ? normalizeLogLevel(level) : null;
  return normalizeStoredLogs(logs).filter(
    (item) =>
      (!wantedSection || item.section === wantedSection) &&
      (!wantedLevel || item.level === wantedLevel),
  );
}

/** Plain text for «کپی همه لاگ‌ها» / «کپی خطاها». */
export function formatLogsForCopy(logs) {
  return normalizeStoredLogs(logs)
    .map((item) => {
      const time = item.at.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
      const suffix = item.detail ? ` — ${item.detail}` : '';
      return `[${time}] [${item.level}] [${item.section}] ${item.message}${suffix}`;
    })
    .join('\n');
}
