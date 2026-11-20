// In-app update checker.
//
// The app has no server, so the "is there a newer build?" answer comes from a
// tiny version.json hosted on the owner's website (GitHub Pages). It is fetched
// ONCE per launch, silently: a 404 / offline / timeout simply means "no update",
// never an error the user sees.
//
// The manifest shape (kept tiny on purpose):
//   { "latestVersion": "1.5.0", "downloadUrl": "...apk", "pageUrl": ".../" }
//
// Only pure helpers live here so scripts/verify.js can unit-test them in Node
// without React or a device.

export const UPDATE_MANIFEST_URL =
  'https://elyasyy23-lgtm.github.io/elyasyy-apps/ContactsApp/version.json';

/** '1.5.0' → [1,5,0]. Junk / empty → []. */
export function parseVersion(value) {
  if (value == null) return [];
  const parts = String(value)
    .trim()
    .split('.')
    .map((p) => parseInt(p, 10));
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return [];
  return parts;
}

/** True only when `remote` is STRICTLY newer than `local` (both dotted versions). */
export function isNewer(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  if (!a.length || !b.length) return false;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u : '');

/**
 * Fetch the manifest. Resolves to
 *   { latestVersion, downloadUrl, pageUrl }  — when the file is valid, or
 *   null                                     — on any failure (never throws).
 */
export async function fetchUpdateManifest(timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      // Cache-buster: Pages/CDN caching must never serve a stale manifest.
      res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res || !res.ok) return null;
    const data = await res.json();
    const latestVersion = String((data && data.latestVersion) || '').trim();
    if (!parseVersion(latestVersion).length) return null;
    return {
      latestVersion,
      downloadUrl: httpsUrl(data && data.downloadUrl),
      pageUrl: httpsUrl(data && data.pageUrl),
    };
  } catch (error) {
    return null;
  }
}
