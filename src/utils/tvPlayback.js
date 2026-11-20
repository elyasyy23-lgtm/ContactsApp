// Modular TV trigger for CCTV archive playback.
// The XMEye/Xiongmai CGI for "play on TV" is ROM/box dependent, so the endpoint
// and payload stay configurable. No React Native imports here: verify.js tests it.

import { ARCHIVE_RTSP_TEMPLATE, archiveWindow, buildArchiveUrl, fillTemplate } from './rtsp';

export const TV_PLAYBACK_ENDPOINT = '';
export const TV_PLAYBACK_METHOD = 'GET';
export const TV_PLAYBACK_PAYLOAD_TEMPLATE = '';
export const DEFAULT_TV_TIMEOUT_MS = 8000;

/**
 * Build a TV playback request. Returns { ok:false, reason:'not-configured' }
 * until the owner supplies the real CGI endpoint/payload.
 */
export function buildTvPlaybackRequest({
  ip,
  port = '34567',
  user = '',
  pass = '',
  timestamp,
  leadMinutes,
  durationMinutes,
  channel = 1,
  subtype = 0,
  rtspPort = null,
  endpoint = TV_PLAYBACK_ENDPOINT,
  method = TV_PLAYBACK_METHOD,
  payloadTemplate = TV_PLAYBACK_PAYLOAD_TEMPLATE,
  template = ARCHIVE_RTSP_TEMPLATE,
  now,
} = {}) {
  const window = archiveWindow({ timestamp, leadMinutes, durationMinutes, now });
  if (!window) return { ok: false, reason: 'bad-timestamp' };
  if (!String(endpoint || '').trim()) return { ok: false, reason: 'not-configured' };

  // The endpoint port (DVRIP/CGI) and the RTSP video port are different
  // settings: 34567 is control, 554 is video.
  const videoPort = rtspPort || port;
  const rtspUrl = buildArchiveUrl({
    ip,
    port: videoPort,
    user,
    pass,
    timestamp,
    leadMinutes,
    durationMinutes,
    channel,
    subtype,
    template,
    now,
  });
  if (!rtspUrl) return { ok: false, reason: 'bad-config' };

  const values = {
    IP: encodeURIComponent(String(ip || '').trim()),
    Port: String(port || '34567'),
    User: encodeURIComponent(String(user || '')),
    Pass: encodeURIComponent(String(pass || '')),
    Channel: String(channel),
    Subtype: String(subtype),
    StartTime: window.startTime,
    EndTime: window.endTime,
    RtspUrl: encodeURIComponent(rtspUrl),
  };

  const url = fillTemplate(endpoint, values);
  const upperMethod = String(method || 'GET').toUpperCase();
  const body = upperMethod === 'GET' || upperMethod === 'HEAD'
    ? null
    : fillTemplate(payloadTemplate, values);
  const headers = body ? { 'Content-Type': 'application/json' } : {};

  return {
    ok: true,
    url,
    method: upperMethod,
    headers,
    body,
    window,
    rtspUrl,
    reason: null,
  };
}

/**
 * Fire the TV playback request. fetch can be injected for tests; AbortController
 * keeps a dead DVR from hanging the UI.
 */
export async function triggerTVPlayback(config = {}, options = {}) {
  const request = buildTvPlaybackRequest(config);
  if (!request.ok) return { ok: false, reason: request.reason };

  const timeoutMs = options.timeoutMs || DEFAULT_TV_TIMEOUT_MS;
  const fetcher = options.fetcher || fetch;
  let controller = null;
  let timer = null;
  let signal;

  if (typeof AbortController === 'function') {
    controller = new AbortController();
    signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const init = {
      method: request.method,
      headers: request.headers,
      body: request.body,
    };
    if (signal) init.signal = signal;
    const response = await fetcher(request.url, init);
    if (!response || !response.ok) {
      return {
        ok: false,
        reason: 'http',
        status: response ? response.status : 0,
        message: `TV playback HTTP ${response ? response.status : 0}`,
      };
    }
    return { ok: true, status: response.status, request };
  } catch (error) {
    return {
      ok: false,
      reason: 'network',
      message: String((error && error.message) || error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
