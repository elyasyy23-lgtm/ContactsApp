// Pure decision logic for the automatic SMS reminder (unit-tested in
// scripts/verify.js). Kept free of React and react-native imports so it can be
// required from plain Node.

/**
 * Ledger unit: every stored amount is in "thousands of Tomans" — 190 in the
 * ledger IS 190,000 Toman for the customer. One unit = 1,000 Toman.
 */
export const TOMAN_PER_UNIT = 1000;

/**
 * Debt above this many UNITS triggers the reminder.
 * 1000 units × 1,000 = 1,000,000 Toman.
 */
export const REMINDER_THRESHOLD = 1000;

/**
 * What should the automatic reminder do for this customer right now?
 *
 *   'send'  → the debt just crossed above the threshold and no reminder has
 *             been handed out for it yet (settings + phone available)
 *   'reset' → the balance came back to/below the threshold: clear the latch so
 *             the NEXT crossing sends exactly one more SMS
 *   'none'  → nothing to do (no debt, already sent for this debt, or the shop
 *             details / phone number are missing — never latch in that case)
 *
 * @param {object} input
 * @param {number} input.balance                 customer balance in Toman
 * @param {boolean} input.sentForCurrentDebt     the persisted latch on the customer
 * @param {boolean} input.settingsReady          myName + cardNumber are filled in
 * @param {boolean} input.hasPhone               the customer has a usable phone number
 * @param {number} [input.threshold]             defaults to REMINDER_THRESHOLD
 */
export function reminderAction({
  balance = 0,
  sentForCurrentDebt = false,
  settingsReady = false,
  hasPhone = false,
  threshold = REMINDER_THRESHOLD,
} = {}) {
  const debt = Number(balance) || 0;
  const sent = Boolean(sentForCurrentDebt);

  if (debt <= threshold) return sent ? 'reset' : 'none';
  if (sent) return 'none';
  if (!settingsReady || !hasPhone) return 'none';
  return 'send';
}
