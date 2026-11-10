// Which reminder control (if any) the UI may show for ONE customer.
//
// The automatic sender (src/utils/reminderAuto.js) is the normal path: an SMS
// goes out by itself the moment a credit pushes the debt above the threshold.
// A manual button is therefore only a FALLBACK for the cases where the
// automatic path genuinely cannot send — and the banner must say which case it
// is, instead of always showing «ارسال یادآوری».
//
// Pure module (no React / react-native imports) so scripts/verify.js can
// require it from plain Node.
import { REMINDER_THRESHOLD } from './reminderGate';

export const REMINDER_UI = {
  /** Debt is at/below the threshold → nothing to remind. */
  BELOW: 'below',
  /** The customer's reminder switch is off. */
  OFF: 'off',
  /** Already sent for this debt (latch set) — no button, just a receipt. */
  SENT: 'sent',
  /** Automatic sending is ready and owns the job — NO manual button. */
  ARMED: 'armed',
  /** Silent send exists (real APK) but SEND_SMS was not granted yet. */
  PERMISSION: 'permission',
  /** Shop name / card number missing → the template cannot be built. */
  SETTINGS: 'settings',
  /** The customer has no usable phone number. */
  PHONE: 'phone',
  /** No native SMS module (Expo Go) → composer fallback only. */
  UNAVAILABLE: 'unavailable',
};

/**
 * @param {object} input
 * @param {number}  input.balance              balanceOf(contact) in ledger units
 * @param {boolean} input.sentForCurrentDebt   persisted once-per-debt latch
 * @param {boolean} input.reminderEnabled      customer switch (false = off)
 * @param {boolean} input.settingsReady        myName + cardNumber filled
 * @param {boolean} input.hasPhone             customer has digits in the phone
 * @param {boolean} input.silentAvailable      native module present
 * @param {boolean} input.permissionGranted    SEND_SMS already granted
 * @param {number}  [input.threshold]
 * @returns {{mode: string, canAuto: boolean}}
 */
export function reminderUiState({
  balance = 0,
  sentForCurrentDebt = false,
  reminderEnabled = true,
  settingsReady = false,
  hasPhone = false,
  silentAvailable = false,
  permissionGranted = false,
  threshold = REMINDER_THRESHOLD,
} = {}) {
  const debt = Number(balance) || 0;

  // Below the threshold nobody is reminded automatically; the «پیامک تسویه»
  // button is a separate manual action the screen handles on its own.
  if (debt <= threshold) return { mode: REMINDER_UI.BELOW, canAuto: false };
  if (reminderEnabled === false) return { mode: REMINDER_UI.OFF, canAuto: false };
  // Already delivered for this debt crossing — show the receipt, not a button.
  if (sentForCurrentDebt) return { mode: REMINDER_UI.SENT, canAuto: true };
  if (!settingsReady) return { mode: REMINDER_UI.SETTINGS, canAuto: false };
  if (!hasPhone) return { mode: REMINDER_UI.PHONE, canAuto: false };
  if (!silentAvailable) return { mode: REMINDER_UI.UNAVAILABLE, canAuto: false };
  if (!permissionGranted) return { mode: REMINDER_UI.PERMISSION, canAuto: false };
  // Everything the automatic sender needs is in place.
  return { mode: REMINDER_UI.ARMED, canAuto: true };
}

/**
 * True when the screen must NOT offer a manual send button: the automatic
 * sender either already delivered this debt or is about to.
 */
export function isAutoOwned(mode) {
  return mode === REMINDER_UI.ARMED || mode === REMINDER_UI.SENT;
}
