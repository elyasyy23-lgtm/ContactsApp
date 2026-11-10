// Silent SMS dispatch — used by the MANUAL reminder sender
// (src/utils/reminderSend.js) and callable from anywhere.
//
// The transport ladder:
//   1. Real APK (native module present) + SEND_SMS granted → SmsManager
//      sends the message in the background — no messaging app, no Send
//      button.
//   2. Expo Go / permission denied / any failure → the caller falls back to
//      opening the messaging app pre-filled.
import { PermissionsAndroid } from 'react-native';
import { isAvailable, sendSmsNative } from '../../modules/sms-reader';

/** True only when the native module exists (i.e. a real APK/dev build). */
export const silentSmsAvailable = isAvailable;

export function cleanSmsPhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

/**
 * Send `body` to `phone` without opening any app.
 * Always resolves to { ok, reason } — never throws.
 * reason: 'destination' | 'unavailable' | 'permission' | 'error'.
 */
export async function sendSilently(phone, body) {
  const destination = cleanSmsPhone(phone);
  if (!destination) return { ok: false, reason: 'destination' };
  if (!isAvailable) return { ok: false, reason: 'unavailable' };

  // One-time Android grant dialog; returns 'granted' immediately (no dialog)
  // when the permission was already granted before.
  try {
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
    );
    if (status !== PermissionsAndroid.RESULTS.GRANTED) {
      return { ok: false, reason: 'permission' };
    }
  } catch (error) {
    return { ok: false, reason: 'permission' };
  }

  return sendSmsNative(destination, body);
}
