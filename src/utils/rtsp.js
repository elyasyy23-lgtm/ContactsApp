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
 * Ordered playback candidates for one transaction, best guess first.
 * Used by the player screen so the owner can settle a firmware question in one
 * tap instead of guessing URLs by hand.
 */
export function buildPlaybackCandidates({
  ip,
  rtspPort = DEFAULT_RTSP_PORT,
  user = '',
  pass = '',
  timestamp,
  channel = DEFAULT_ARCHIVE_CHANNEL,
  leadMinutes,
  durationMinutes,
  now,
} = {}) {
  const port = String(rtspPort || DEFAULT_RTSP_PORT);
  const base = { ip, port, user, pass, channel };
  const list = [];

  // The only candidate whose credentials ride in the path like the working
  // live URL — it cannot make VLC pop its own login dialog.
  const xmArchive = buildXmArchiveUrl({
    ...base,
    timestamp,
    leadMinutes,
    durationMinutes,
    now,
  });
  if (xmArchive) list.push({ key: 'archive-xm-path', url: xmArchive });

  const archiveLocal = buildArchiveUrl({
    ...base,
    timestamp,
    leadMinutes,
    durationMinutes,
    timeMode: 'local',
    now,
  });
  if (archiveLocal) list.push({ key: 'archive-local', url: archiveLocal });

  const archiveUtc = buildArchiveUrl({
    ...base,
    timestamp,
    leadMinutes,
    durationMinutes,
    timeMode: 'utc',
    now,
  });
  if (archiveUtc) list.push({ key: 'archive-utc', url: archiveUtc });

  const window = archiveWindow({ timestamp, leadMinutes, durationMinutes, now });
  if (window) {
    const playback = fillTemplate(PLAYBACK_RTSP_TEMPLATE, {
      IP: String(ip || '').trim(),
      Port: port,
      User: encodeURIComponent(String(user || '')),
      Pass: encodeURIComponent(String(pass || '')),
      Channel: String(channel),
      Subtype: String(DEFAULT_ARCHIVE_SUBTYPE),
      StartTime: window.startDahua,
      EndTime: window.endDahua,
    });
    if (playback && !playback.includes('[')) list.push({ key: 'playback-local', url: playback });
  }


  const live = buildLiveUrl({ ...base, style: 'xm' });
  if (live) list.push({ key: 'live-xm', url: live });

  return list;
}

/** Hide the password when the URL is shown or copied into a log. */
export function maskRtspUrl(url) {
  return String(url || '')
    .replace(/\/\/([^:@/]+):([^@/]*)@/, '//$1:***@')
    .replace(/([?&]password=)[^&]*/i, '$1***');
}
