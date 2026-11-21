// Pure helpers for archived XMEye/Xiongmai DVR playback URLs.
// Kept free of React Native and native modules so scripts/verify.js can test it.
//
// Two ports, never one (this was the 2026-11-19 bug):
//   RTSP  → 554  (video, answers with `Server: H264DVR 1.0`)
//   DVRIP → 34567 (device control; can be moved by the installer, e.g. 34286)
// The archive request must go to the RTSP port, so the app keeps them apart.

export const DEFAULT_RTSP_PORT = '554';
export const DEFAULT_DVRIP_PORT = '34567';
export const DEFAULT_ARCHIVE_CHANNEL = 1;
export const DEFAULT_ARCHIVE_SUBTYPE = 0;
export const DEFAULT_CHANNEL_COUNT = 4;
// The archived window for a debt (ثبت بدهی) row is fixed by the shop owner:
// start FIVE minutes before the transaction, stop FIVE minutes after it, so the
// whole hand-over of the goods is inside one clip.
export const DEFAULT_ARCHIVE_LEAD_MINUTES = 5;
export const DEFAULT_ARCHIVE_TAIL_MINUTES = 5;
export const DEFAULT_ARCHIVE_DURATION_MINUTES =
  DEFAULT_ARCHIVE_LEAD_MINUTES + DEFAULT_ARCHIVE_TAIL_MINUTES;

// Dahua-compatible time-range playback path. Many Xiongmai firmwares answer it
// (and ignore the range on models that do not record over RTSP).
export const ARCHIVE_RTSP_TEMPLATE =
  'rtsp://[User]:[Pass]@[IP]:[Port]/cam/realmonitor?channel=[Channel]&subtype=[Subtype]&starttime=[StartTime]&endtime=[EndTime]';

// Dahua NVR playback path (underscore separated stamps).
export const PLAYBACK_RTSP_TEMPLATE =
  'rtsp://[User]:[Pass]@[IP]:[Port]/cam/playback?channel=[Channel]&subtype=[Subtype]&starttime=[StartTime]&endtime=[EndTime]';

// Dahua-compatible live path (no time range).
export const DAHUA_LIVE_RTSP_TEMPLATE =
  'rtsp://[User]:[Pass]@[IP]:[Port]/cam/realmonitor?channel=[Channel]&subtype=[Subtype]';

// Xiongmai native live form. Credentials are query parameters, not userinfo.
export const XM_LIVE_RTSP_TEMPLATE =
  'rtsp://[IP]:[Port]/user=[User]&password=[Pass]&channel=[Channel]&stream=[Subtype].sdp?real_stream';

// Same XM credential style (path parameters, NOT `user:pass@`) with a time
// range appended. The LIVE URL works in VLC with no password dialog exactly
// because the credentials ride inside the path: VLC never sees a userinfo
// component, so it never runs its own RTSP auth and the DVR authenticates the
// request itself. Every `user:pass@` URL makes VLC answer the 401 challenge
// with its own "RTSP authentication" dialog, which is the prompt the shop
// owner kept seeing. Whether the firmware honours the range on this path is a
// device question — but the URL shape removes the prompt either way.
export const XM_ARCHIVE_RTSP_TEMPLATE =
  'rtsp://[IP]:[Port]/user=[User]&password=[Pass]&channel=[Channel]&stream=[Subtype].sdp?real_stream&starttime=[StartTime]&endtime=[EndTime]';

// ── GUEST (password-free) archive forms ────────────────────────────────────
// Owner rule (2026-11-20): archive playback must behave exactly like the live
// stream — no password entry anywhere. So the app never puts credentials into
// these URLs: no `user:pass@`, no `password=<secret>`. The DVR is expected to
// answer as a guest, and a rejected guest request is reported honestly instead
// of being papered over with a credential prompt.
//
// Xiongmai native archive: the live path (`/user=..&password=..&channel=..
// &stream=..sdp?real_stream`) with empty credential params and a time range in
// the vendor's own 14-digit stamp form (`YYYYMMDDhhmmss`, device-local clock).
export const XM_GUEST_ARCHIVE_RTSP_TEMPLATE =
  'rtsp://[IP]:[Port]/user=&password=&channel=[Channel]&stream=[Subtype].sdp?real_stream&starttime=[XmStart]&endtime=[XmEnd]';

// Same native path with no credential parameters at all.
export const XM_GUEST_BARE_ARCHIVE_RTSP_TEMPLATE =
  'rtsp://[IP]:[Port]/cam/realmonitor?channel=[Channel]&subtype=[Subtype]&starttime=[XmStart]&endtime=[XmEnd]';

// Dahua-compatible guest range path (no userinfo component).
export const DAHUA_GUEST_ARCHIVE_RTSP_TEMPLATE =
  'rtsp://[IP]:[Port]/cam/realmonitor?channel=[Channel]&subtype=[Subtype]&starttime=[StartTime]&endtime=[EndTime]';

const pad = (value) => String(value).padStart(2, '0');

const asDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * DVR wire format: YYYYMMDDThhmmss.
 * The DVR records on its OWN clock, which is the shop's local time, so the
 * default mode is local. `{ utc: true }` keeps the older `...Z` form for
 * NVRs that document UTC ranges.
 */
export function toDvrStamp(value, { utc = false } = {}) {
  const date = asDate(value);
  if (!date) return null;
  const y = utc ? date.getUTCFullYear() : date.getFullYear();
  const mo = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const d = utc ? date.getUTCDate() : date.getDate();
  const h = utc ? date.getUTCHours() : date.getHours();
  const mi = utc ? date.getUTCMinutes() : date.getMinutes();
  const s = utc ? date.getUTCSeconds() : date.getSeconds();
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}${pad(s)}${utc ? 'Z' : ''}`;
}

/**
 * Xiongmai wire format: YYYYMMDDhhmmss — 14 digits, no separators, no `Z`.
 * This is the form the vendor's own clients send for archive ranges, and it is
 * read against the DVR's local clock (the shop's wall clock).
 */
export function toXmStamp(value) {
  const date = asDate(value);
  if (!date) return null;
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Dahua NVR playback stamp: YYYY_MM_DD_HH_MM_SS (local by default). */
export function toDahuaStamp(value, { utc = false } = {}) {
  const basic = toDvrStamp(value, { utc });
  if (!basic) return null;
  const digitsOnly = basic.replace('Z', '');
  return `${digitsOnly.slice(0, 4)}_${digitsOnly.slice(4, 6)}_${digitsOnly.slice(6, 8)}_${digitsOnly.slice(
    9,
    11,
  )}_${digitsOnly.slice(11, 13)}_${digitsOnly.slice(13, 15)}`;
}

/**
 * Valid, exact timestamp for one transaction.
 * A valid string is returned untouched (`2026-11-19T12:34:56Z` stays exactly that),
 * so older/newer transactions never get a rewritten or invented value.
 * Returns null when missing or unusable, so callers can show a graceful message.
 * Accepts a transaction object ({ createdAt }) or a raw date value.
 */
export function transactionTimestamp(value) {
  const raw = value && typeof value === 'object' ? value.createdAt : value;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return null;
  return typeof raw === 'string' ? raw : new Date(ms).toISOString();
}

/**
 * Build the archive window for a transaction.
 * Start = transaction time - leadMinutes (owner: 5 minutes).
 * End = start + durationMinutes (configurable, default 10 minutes).
 * `startTime` / `endTime` are LOCAL DVR stamps; `...Utc` twins are available too.
 */
export function archiveWindow({
  timestamp,
  leadMinutes = DEFAULT_ARCHIVE_LEAD_MINUTES,
  tailMinutes,
  durationMinutes = DEFAULT_ARCHIVE_DURATION_MINUTES,
  now = Date.now,
} = {}) {
  const fallback = typeof now === 'function' ? now() : now;
  const base = timestamp ? new Date(timestamp).getTime() : new Date(fallback).getTime();
  if (!Number.isFinite(base)) return null;
  const leadMs = Math.max(0, Number(leadMinutes) || 0) * 60 * 1000;
  // `tailMinutes` is the explicit form (start −5, end +5). `durationMinutes`
  // stays supported for older callers and means the whole span.
  const tailMs =
    tailMinutes == null ? null : Math.max(0, Number(tailMinutes) || 0) * 60 * 1000;
  const durationMs =
    tailMs != null
      ? leadMs + tailMs
      : Math.max(1, Number(durationMinutes) || 1) * 60 * 1000;
  const start = base - leadMs;
  const end = start + durationMs;
  const startTime = toDvrStamp(start);
  const endTime = toDvrStamp(end);
  if (!startTime || !endTime) return null;
  return {
    base,
    start,
    end,
    leadMinutes: leadMs / 60000,
    tailMinutes: (end - base) / 60000,
    startTime,
    endTime,
    startTimeUtc: toDvrStamp(start, { utc: true }),
    endTimeUtc: toDvrStamp(end, { utc: true }),
    startXm: toXmStamp(start),
    endXm: toXmStamp(end),
    startDahua: toDahuaStamp(start),
    endDahua: toDahuaStamp(end),
  };
}

/** Replace every [Key] placeholder in a template. Unknown keys stay untouched. */
export function fillTemplate(template, values) {
  return String(template || '').replace(/\[([A-Za-z0-9_]+)\]/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

/** Effective RTSP port: explicit `rtspPort`, else 554. Never the DVRIP port. */
export function rtspPortOf(settings = {}) {
  const value = String(settings.rtspPort || '').replace(/\D/g, '');
  return value || DEFAULT_RTSP_PORT;
}

// Ports that are NOT RTSP video: DVRIP control (34567), adb (5037/5555) and the
// RTSP-less web port. Guard so a stale setting can never send video to them.
const NON_RTSP_PORTS = new Set(['34567', '5037', '5555', '80', '8080', '9080']);

/**
 * RTSP video port, hardened: a value that is not a real RTSP port (notably the
 * DVRIP control port 34567) is replaced by 554 instead of being used.
 */
export function safeRtspPort(value) {
  const digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (!digits) return DEFAULT_RTSP_PORT;
  if (NON_RTSP_PORTS.has(digits)) return DEFAULT_RTSP_PORT;
  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 65535) return DEFAULT_RTSP_PORT;
  return digits;
}

/** Effective DVRIP port (device control, used by the native archive module). */
export function dvripPortOf(settings = {}) {
  const value = String(settings.dvrPort || '').replace(/\D/g, '');
  return value || DEFAULT_DVRIP_PORT;
}

export function channelOf(settings = {}) {
  const value = Number(settings.dvrChannel);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_ARCHIVE_CHANNEL;
  return Math.min(DEFAULT_CHANNEL_COUNT, Math.trunc(value));
}

/**
 * Build the archived RTSP URL. Returns null when the config is unusable.
 * `timeMode: 'local'` (default) uses the DVR's own clock; `'utc'` appends `Z`.
 */
export function buildArchiveUrl({
  ip,
  port = DEFAULT_RTSP_PORT,
  user = '',
  pass = '',
  timestamp,
  leadMinutes,
  durationMinutes,
  channel = DEFAULT_ARCHIVE_CHANNEL,
  subtype = DEFAULT_ARCHIVE_SUBTYPE,
  timeMode = 'local',
  template = ARCHIVE_RTSP_TEMPLATE,
  now,
} = {}) {
  const host = String(ip || '').trim();
  if (!host) return null;
  const window = archiveWindow({ timestamp, leadMinutes, durationMinutes, now });
  if (!window) return null;
  const utc = timeMode === 'utc';
  const values = {
    IP: host,
    Port: String(port || DEFAULT_RTSP_PORT),
    User: encodeURIComponent(String(user || '')),
    Pass: encodeURIComponent(String(pass || '')),
    Channel: String(channel),
    Subtype: String(subtype),
    StartTime: utc ? window.startTimeUtc : window.startTime,
    EndTime: utc ? window.endTimeUtc : window.endTime,
    StartDahua: window.startDahua,
    EndDahua: window.endDahua,
  };
  const url = fillTemplate(template, values);
  return url.includes('[') ? null : url;
}

/** Live RTSP URL. `style: 'xm'` is the Xiongmai native form, `'dahua'` the compatible one. */export function buildLiveUrl({
  ip,
  port = DEFAULT_RTSP_PORT,
  user = '',
  pass = '',
  channel = DEFAULT_ARCHIVE_CHANNEL,
  subtype = DEFAULT_ARCHIVE_SUBTYPE,
  style = 'xm',
} = {}) {
  const host = String(ip || '').trim();
  if (!host) return null;
  const values = {
    IP: host,
    Port: String(port || DEFAULT_RTSP_PORT),
    User: encodeURIComponent(String(user || '')),
    Pass: encodeURIComponent(String(pass || '')),
    Channel: String(channel),
    Subtype: String(subtype),
  };
  const template = style === 'dahua' ? DAHUA_LIVE_RTSP_TEMPLATE : XM_LIVE_RTSP_TEMPLATE;
  const url = fillTemplate(template, values);
  return url.includes('[') ? null : url;
}

/**
 * Archive URL in the SAME credential shape as the working live URL.
 *
 * Why this matters: `rtsp://user:pass@host/path` puts the credentials in the
 * URL userinfo, which VLC for Android drops for RTSP — it then answers the
 * DVR's `401 Digest` challenge with its own username/password dialog. The live
 * URL carries `user=…&password=…` inside the PATH instead, so VLC never runs
 * any auth of its own and no dialog ever appears.
 */
export function buildXmArchiveUrl({
  ip,
  port = DEFAULT_RTSP_PORT,
  user = '',
  pass = '',
  channel = DEFAULT_ARCHIVE_CHANNEL,
  subtype = DEFAULT_ARCHIVE_SUBTYPE,
  timestamp,
  leadMinutes,
  durationMinutes,
  now,
} = {}) {
  const host = String(ip || '').trim();
  if (!host) return null;
  const window = archiveWindow({ timestamp, leadMinutes, durationMinutes, now });
  if (!window) return null;
  const url = fillTemplate(XM_ARCHIVE_RTSP_TEMPLATE, {
    IP: host,
    Port: String(port || DEFAULT_RTSP_PORT),
    User: encodeURIComponent(String(user || '')),
    Pass: encodeURIComponent(String(pass || '')),
    Channel: String(channel),
    Subtype: String(subtype),
    StartTime: window.startTime,
    EndTime: window.endTime,
  });
  return url.includes('[') ? null : url;
}

/**
 * Password-free archive URL for one transaction (the DEFAULT path).
 *
 * `style`:
 *   'xm'        – Xiongmai native path with EMPTY credential params, 14-digit
 *                 vendor stamps (closest to the working live URL shape).
 *   'xm-bare'   – same native path with no credential params at all.
 *   'dahua'     – `/cam/realmonitor` range with local `YYYYMMDDThhmmss`.
 *   'dahua-utc' – same with the `...Z` UTC stamp.
 * No userinfo is ever produced, so VLC cannot raise its own login dialog.
 */
export function buildGuestArchiveUrl({
  ip,
  port = DEFAULT_RTSP_PORT,
  timestamp,
  channel = DEFAULT_ARCHIVE_CHANNEL,
  subtype = DEFAULT_ARCHIVE_SUBTYPE,
  style = 'xm',
  leadMinutes,
  durationMinutes,
  now,
} = {}) {
  const host = String(ip || '').trim();
  if (!host) return null;
  const window = archiveWindow({ timestamp, leadMinutes, durationMinutes, now });
  if (!window) return null;
  const templates = {
    xm: { template: XM_GUEST_ARCHIVE_RTSP_TEMPLATE, utc: false },
    'xm-bare': { template: XM_GUEST_BARE_ARCHIVE_RTSP_TEMPLATE, utc: false },
    dahua: { template: DAHUA_GUEST_ARCHIVE_RTSP_TEMPLATE, utc: false },
    'dahua-utc': { template: DAHUA_GUEST_ARCHIVE_RTSP_TEMPLATE, utc: true },
  };
  const chosen = templates[style] || templates.xm;
  const url = fillTemplate(chosen.template, {
    IP: host,
    Port: safeRtspPort(port),
    Channel: String(channel),
    Subtype: String(subtype),
    XmStart: window.startXm,
    XmEnd: window.endXm,
    StartTime: chosen.utc ? window.startTimeUtc : window.startTime,
    EndTime: chosen.utc ? window.endTimeUtc : window.endTime,
  });
  return url.includes('[') ? null : url;
}

/**
 * Archive URL with the credentials in the PATH (`user=…&password=…`) and the
 * vendor 14-digit range — the LIVE URL shape, which plays without any VLC
 * dialog because VLC never sees a userinfo component.
 *
 * Used ONLY as a fallback: the shop DVR was measured answering `401` to every
 * anonymous DESCRIBE, so a password-free request alone cannot play. The caller
 * probes the guest URLs first and reaches for this one only when the DVR
 * demands auth — the prompt the owner must never see stays in the DVR, not in
 * VLC.
 */
export function buildPathCredentialArchiveUrl({
  ip,
  port = DEFAULT_RTSP_PORT,
  user = 'admin',
  pass = '',
  timestamp,
  channel = DEFAULT_ARCHIVE_CHANNEL,
  subtype = DEFAULT_ARCHIVE_SUBTYPE,
  leadMinutes,
  durationMinutes,
  now,
} = {}) {
  const host = String(ip || '').trim();
  if (!host) return null;
  const secret = String(pass || '');
  if (!secret) return null; // no stored password → no auth candidate
  const window = archiveWindow({ timestamp, leadMinutes, durationMinutes, now });
  if (!window) return null;
  const url = fillTemplate(XM_ARCHIVE_RTSP_TEMPLATE, {
    IP: host,
    Port: safeRtspPort(port),
    User: encodeURIComponent(String(user || 'admin')),
    Pass: encodeURIComponent(secret),
    Channel: String(channel),
    Subtype: String(subtype),
    StartTime: window.startXm,
    EndTime: window.endXm,
  });
  return url.includes('[') ? null : url;
}

/**
 * Ordered, CREDENTIAL-FREE playback candidates for one transaction, best guess
 * first. Every entry is safe to hand to VLC: none carries a password, so none
 * can trigger the "RTSP authentication" dialog. The first entry is the default
 * one-tap action; the rest let the owner settle a firmware question in a tap.
 */
export function buildPlaybackCandidates({
  ip,
  rtspPort = DEFAULT_RTSP_PORT,
  user = 'admin',
  pass = '',
  timestamp,
  channel = DEFAULT_ARCHIVE_CHANNEL,
  subtype = DEFAULT_ARCHIVE_SUBTYPE,
  leadMinutes,
  durationMinutes,
  now,
} = {}) {
  const port = safeRtspPort(rtspPort);
  const base = { ip, port, channel, subtype, timestamp, leadMinutes, durationMinutes, now };
  const list = [];

  // 1) Guest first — works on DVRs that allow anonymous playback.
  const order = ['xm', 'xm-bare', 'dahua', 'dahua-utc'];
  order.forEach((style) => {
    const url = buildGuestArchiveUrl({ ...base, style });
    if (url) list.push({ key: `archive-guest-${style}`, url });
  });

  // 2) Auth fallback (password in the PATH, never userinfo → no VLC dialog).
  const auth = buildPathCredentialArchiveUrl({ ...base, user, pass });
  if (auth) list.push({ key: 'archive-auth-xm', url: auth });

  // 3) Live stream, to tell "no archive" apart from "no network".
  const live = buildLiveUrl({ ip, port, channel, subtype, style: 'xm' });
  if (live) list.push({ key: 'live-guest-xm', url: live });
  if (String(pass || '')) {
    const liveAuth = fillTemplate(XM_LIVE_RTSP_TEMPLATE, {
      IP: String(ip || '').trim(),
      Port: port,
      User: encodeURIComponent(String(user || 'admin')),
      Pass: encodeURIComponent(String(pass)),
      Channel: String(channel),
      Subtype: String(subtype),
    });
    if (liveAuth && !liveAuth.includes('[')) list.push({ key: 'live-auth-xm', url: liveAuth });
  }

  return list;
}

/** Hide the password when the URL is shown or copied into a log. */
export function maskRtspUrl(url) {
  return String(url || '')
    .replace(/\/\/([^:@/]+):([^@/]*)@/, '//$1:***@')
    .replace(/([?&]password=)[^&]*/i, '$1***');
}
