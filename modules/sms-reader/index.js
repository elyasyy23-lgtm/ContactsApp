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
