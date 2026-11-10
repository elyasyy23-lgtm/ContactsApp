// JS side of the local "sms-reader" native module.
// In Expo Go the native module does not exist, so every call degrades to a
// harmless no-op (the manual SMS import screen stays available).
import { EventEmitter, requireNativeModule } from 'expo-modules-core';

const nativeModule = (() => {
  try {
    return requireNativeModule('SmsReader');
  } catch (error) {
    return null;
  }
})();

const emitter = nativeModule ? new EventEmitter(nativeModule) : null;

function parseList(json) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

export const isAvailable = !!nativeModule;

export async function getPendingSms() {
  if (!nativeModule) return [];
  return parseList(await nativeModule.getPending());
}

export async function clearPendingSms(ids) {
  if (!nativeModule || !Array.isArray(ids) || ids.length === 0) return 0;
  return nativeModule.clearPending(ids);
}

export async function readInbox(sinceMs = 0, limit = 100) {
  if (!nativeModule) return [];
  return parseList(await nativeModule.readInbox(sinceMs, limit));
}

export function addSmsListener(handler) {
  if (!emitter) return { remove() {} };
  const subscription = emitter.addListener('onSmsReceived', handler);
  return { remove: () => subscription.remove() };
}

export async function hasSendSmsPermission() {
  if (!nativeModule) return false;
  try {
    return Boolean(await nativeModule.hasSendSmsPermission());
  } catch (error) {
    return false;
  }
}

// True background send (SmsManager). Returns { ok, reason } — never throws.
export async function sendSmsNative(destination, body) {
  if (!nativeModule) return { ok: false, reason: 'unavailable' };
  try {
    const result = await nativeModule.sendSms(destination, body);
    return result && typeof result === 'object'
      ? result
      : { ok: false, reason: 'error' };
  } catch (error) {
    return { ok: false, reason: 'error', message: String(error?.message || error) };
  }
}
