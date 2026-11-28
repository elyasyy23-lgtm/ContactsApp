// JS side of the local "cctv-playback" native module.
//
// One job only: tell the shop DVR to show a recording on the monitor that is
// plugged into the recorder. Nothing is downloaded, no stream is opened and no
// player app is launched — the picture appears on the TV the DVR already drives.
//
// Expo Go has no DVRIP socket, so every call degrades to a harmless
// `{ ok: false, reason: 'unavailable' }` and nothing crashes.
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
 * Sends the archive-play command to the recorder's own keypad.
 *
 * options: { ip, port, user, password, channel, startMs }
 *   startMs = the moment to show (the transaction time).
 *
 * Resolves { ok: true, recordings, query, keys } or
 *          { ok: false, reason, message } — never throws.
 * reason: 'unavailable' | 'config' | 'time' | 'error'
 */
export async function playOnTv(options) {
  const payload = options && typeof options === 'object' ? options : {};
  if (!nativeModule || typeof nativeModule.playOnTv !== 'function') {
    return { ok: false, reason: 'unavailable' };
  }
  if (!String(payload.ip || '').trim()) return { ok: false, reason: 'config' };
  const port = Number(payload.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, reason: 'config' };
  }
  const startMs = Number(payload.startMs);
  if (!Number.isFinite(startMs) || startMs <= 0) return { ok: false, reason: 'time' };

  try {
    const result = await nativeModule.playOnTv(payload);
    return result && typeof result === 'object' ? result : { ok: false, reason: 'error' };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: String(error?.message || error),
    };
  }
}

export function addCctvListener(handler) {
  if (!emitter) return { remove() {} };
  const subscription = emitter.addListener('onCctvEvent', handler);
  return { remove: () => subscription.remove() };
}
