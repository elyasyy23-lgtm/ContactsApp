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

function normalizeNativeResult(result, fallbackReason) {
  return result && typeof result === 'object' ? result : { ok: false, reason: fallbackReason };
}

/**
 * Configure the native Friday 10:00 scheduler. Expo Go has no native module,
 * so this is an explicit no-op there; the UI keeps the weekly switch disabled
 * in that fallback.
 */
export async function setWeeklyReminderConfig(config) {
  if (!nativeModule) return { ok: false, reason: 'unavailable' };
  try {
    return normalizeNativeResult(
      await nativeModule.setWeeklyReminderConfig(config || {}),
      'error',
    );
  } catch (error) {
    return { ok: false, reason: 'error', message: String(error?.message || error) };
  }
}

/** Hand the native scheduler a fresh per-customer snapshot. */
export async function syncWeeklyReminder(snapshot) {
  if (!nativeModule) return { ok: false, reason: 'unavailable' };
  try {
    return normalizeNativeResult(await nativeModule.syncWeeklyReminder(snapshot || {}), 'error');
  } catch (error) {
    return { ok: false, reason: 'error', message: String(error?.message || error) };
  }
}

/**
 * Drain weekly-send events that happened while JS was not listening (e.g. a
 * cold start after the native alarm fired). Native clears its queue here.
 */
export async function drainWeeklySmsEvents() {
  if (!nativeModule || typeof nativeModule.drainWeeklySmsEvents !== 'function') return [];
  try {
    const events = await nativeModule.drainWeeklySmsEvents();
    if (!Array.isArray(events)) return [];
    return events
      .map((event) => ({
        contactId: String(event?.contactId ?? event?.contact_id ?? ''),
        week: String(event?.week ?? event?.slot ?? ''),
        timestamp: Number(event?.timestamp ?? 0),
      }))
      .filter((event) => event.contactId && event.week);
  } catch (error) {
    return [];
  }
}

/** Native emits { contactId, week } after a successful silent weekly send. */
export function addWeeklySmsSentListener(handler) {
  if (!emitter || typeof handler !== 'function') return { remove() {} };
  const subscription = emitter.addListener('onWeeklySmsSent', (event) => {
    if (!event || typeof event !== 'object') return;
    const contactId = String(event.contactId || event.contact_id || '');
    const week = String(event.week || event.slot || '');
    if (contactId && week) handler({ contactId, week });
  });
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
