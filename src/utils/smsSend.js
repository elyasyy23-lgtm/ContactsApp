// Silent SMS dispatch — used by the AUTOMATIC reminder sender
// (src/utils/reminderAuto.js, fired from the transaction save) and by the
// manual fallback button (src/utils/reminderSend.js).
//
// The transport ladder:
//   1. Real APK (native module present) + SEND_SMS granted → SmsManager
//      sends the message in the background — no messaging app, no Send
//      button.
//   2. Expo Go / permission denied / any failure → the caller falls back to
//      opening the messaging app pre-filled.
import { PermissionsAndroid } from 'react-native';
import {
  hasSendSmsPermission,
  isAvailable,
  sendSmsNative,
} from '../../modules/sms-reader';

/** True only when the native module exists (i.e. a real APK/dev build). */
export const silentSmsAvailable = isAvailable;

export function cleanSmsPhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

/**
 * SEND_SMS state WITHOUT any dialog. The automatic sender uses this: prompting
 * the user with a permission dialog in the middle of a save (or on every screen
 * open) would be a surprise. The manual button requests it instead.
 */
export async function hasSendPermission() {
  if (!isAvailable) return false;
  try {
    return Boolean(await hasSendSmsPermission());
  } catch (error) {
    return false;
  }
}

/**
 * Ask Android for SEND_SMS (one dialog, and only while not granted).
 * Returns true when the permission ends up granted.
 */
export async function requestSendPermission() {
  if (!isAvailable) return false;
  if (await hasSendPermission()) return true;
  try {
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    return false;
  }
}

/**
 * Send `body` to `phone` without opening any app.
 * Always resolves to { ok, reason } — never throws.
 * reason: 'destination' | 'unavailable' | 'permission' | 'error'.
 *
 * `requestPermission: false` (the automatic path) never opens the Android
 * permission dialog — it reports `permission` and lets the caller surface a
 * one-tap fix.
 */
export async function sendSilently(
  phone,
  body,
  { requestPermission = true } = {},
) {
  const destination = cleanSmsPhone(phone);
  if (!destination) return { ok: false, reason: 'destination' };
  if (!isAvailable) return { ok: false, reason: 'unavailable' };

  // One-time Android grant dialog; returns 'granted' immediately (no dialog)
  // when the permission was already granted before.
  try {
    if (requestPermission) {
      const status = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
      );
      if (status !== PermissionsAndroid.RESULTS.GRANTED) {
        return { ok: false, reason: 'permission' };
      }
    } else if (!(await hasSendPermission())) {
      return { ok: false, reason: 'permission' };
    }
  } catch (error) {
    return { ok: false, reason: 'permission' };
  }

  return sendSmsNative(destination, body);
}
