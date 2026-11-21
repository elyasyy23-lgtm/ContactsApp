// JS side of the local "cctv-playback" native module.
//
// Expo Go has no DVRIP socket, so every call here degrades to a harmless no-op
// result. The screen keeps working (it still shows the archive link and the TV
// trigger) and nothing crashes. VLC stays the video player: this module only
// fetches a recording and can hand a URI (with the read grant) to the player.
import { EventEmitter, requireNativeModule } from 'expo-modules-core';

const nativeModule = (() => {
  try {
    return requireNativeModule('CctvPlayback');
  } catch (error) {
    return null;
  }
})();

const emitter = nativeModule ? new EventEmitter(nativeModule) : null;

export const isAvailable = !!nativeModule;

/**
 * Downloads the archived clip that covers `startMs` from the DVR.
 * The caller publishes the returned local file and opens it in VLC.
 * The password is handed to native code only for the lifetime of the call; it
 * is never stored or logged.
 *
 * Resolves { ok, path, file, bytes, begin, end } or
 *          { ok: false, reason, message } — never throws.
 */
export async function playArchive(options) {
  const payload = options && typeof options === 'object' ? options : {};
  if (!nativeModule) return { ok: false, reason: 'unavailable' };
  if (!payload.ip || !Number.isFinite(Number(payload.port))) {
    return { ok: false, reason: 'config' };
  }
  if (!Number.isFinite(Number(payload.startMs))) {
    return { ok: false, reason: 'time' };
  }
  try {
    const result = await nativeModule.playArchive(payload);
    return result && typeof result === 'object' ? result : { ok: false, reason: 'error' };
  } catch (error) {
    const code = String(error?.code || '');
    return {
      ok: false,
      reason: code === 'E_CANCELLED' ? 'cancelled' : 'error',
      message: String(error?.message || error),
    };
  }
}

/**
 * Streams the archived window instead of downloading it first.
 *
 * Same options as `playArchive` (plus `streamType: 0|1`), but it resolves as
 * soon as the recording is located and returns `{ ok, url, streaming: true }`.
 * The player opens `url` (loopback HTTP served by the native module) and starts
 * on the first frames while the rest is still arriving — the XMEye behaviour.
 * Transfer problems after the resolve arrive as `error` events.
 */
export async function streamArchive(options) {
  const payload = options && typeof options === 'object' ? options : {};
  if (!nativeModule || typeof nativeModule.streamArchive !== 'function') {
    return { ok: false, reason: 'unavailable' };
  }
  if (!payload.ip || !Number.isFinite(Number(payload.port))) {
    return { ok: false, reason: 'config' };
  }
  if (!Number.isFinite(Number(payload.startMs))) {
    return { ok: false, reason: 'time' };
  }
  try {
    const result = await nativeModule.streamArchive(payload);
    return result && typeof result === 'object' ? result : { ok: false, reason: 'error' };
  } catch (error) {
    const code = String(error?.code || '');
    return {
      ok: false,
      reason: code === 'E_CANCELLED' ? 'cancelled' : 'error',
      message: String(error?.message || error),
    };
  }
}

/**
 * Read-only check of what the recorder allows without a password.
 *
 * Returns `{ ok, guestUsable, attempts, configs }`. Nothing is written to the
 * device — the DVRIP protocol has no account-write call, so guest access can
 * only be enabled on the recorder itself.
 */
export async function probeGuest(options) {
  const payload = options && typeof options === 'object' ? options : {};
  if (!nativeModule || typeof nativeModule.probeGuest !== 'function') {
    return { ok: false, guestUsable: false, reason: 'unavailable', attempts: [], configs: {} };
  }
  try {
    const result = await nativeModule.probeGuest(payload);
    return result && typeof result === 'object'
      ? result
      : { ok: false, guestUsable: false, attempts: [], configs: {} };
  } catch (error) {
    return {
      ok: false,
      guestUsable: false,
      reason: String(error?.message || 'error'),
      attempts: [],
      configs: {},
    };
  }
}

/** Cancels an in-flight download. */
export async function stopArchive() {
  if (!nativeModule) return false;
  try {
    return Boolean(await nativeModule.stop());
  } catch (error) {
    return false;
  }
}

/**
 * Opens a stream or a local `content://` clip in VLC, granting read access.
 * Resolves true when a player accepted the URI.
 */
export async function openInVlc(uri, mimeType) {
  if (!nativeModule) return false;
  try {
    return Boolean(await nativeModule.openInVlc(String(uri), mimeType || 'video/*'));
  } catch (error) {
    return false;
  }
}

/**
 * Asks the DVR whether an RTSP URL is playable, before VLC ever sees it.
 *
 * Returns { ok, status, reason }. `ok` is true only for a 2xx DESCRIBE answer.
 * Used to pick the right archive URL (guest first, then the credential-in-path
 * form) so VLC is never handed a URL that answers `401` — which is what makes
 * VLC pop its own username/password dialog.
 */
export async function probeRtsp(url) {
  if (!nativeModule) return { ok: false, status: 0, reason: 'unavailable' };
  const target = String(url || '').trim();
  if (!target) return { ok: false, status: 0, reason: 'empty-url' };
  try {
    const result = await nativeModule.probeRtsp(target);
    if (!result || typeof result !== 'object') return { ok: false, status: 0, reason: 'error' };
    return {
      ok: Boolean(result.ok),
      status: Number(result.status) || 0,
      reason: String(result.reason || ''),
    };
  } catch (error) {
    return { ok: false, status: 0, reason: String(error?.message || 'error') };
  }
}

export function addCctvListener(handler) {
  if (!emitter) return { remove() {} };
  const subscription = emitter.addListener('onCctvEvent', handler);
  return { remove: () => subscription.remove() };
}
