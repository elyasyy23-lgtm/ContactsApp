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

export function addCctvListener(handler) {
  if (!emitter) return { remove() {} };
  const subscription = emitter.addListener('onCctvEvent', handler);
  return { remove: () => subscription.remove() };
}
