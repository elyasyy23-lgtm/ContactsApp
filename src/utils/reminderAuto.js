// AUTOMATIC reminder — fired by the transaction save path in ContactsContext
// (the moment a credit pushes the debt above REMINDER_THRESHOLD). Never from a
// button tap, never from a screen effect.
//
// Rules (owner spec 2026-11-10):
//   1. debt goes above 1,000 units (1,000,000 Toman) → exactly ONE silent SMS
//   2. a payment brings it to/below 1,000 → the latch resets
//      (`settleReminderLatch` in ContactsContext)
//   3. new credit pushes it above again → exactly ONE more SMS
//
// Automatic sending is SILENT ONLY: no messaging app is opened and there is no
// composer fallback (a popup in the middle of a save would be a surprise). When
// the native module or the SEND_SMS permission is missing, nothing is sent AND
// nothing is latched — the next save retries once the permission is granted.
import { reminderAction } from './reminderGate';
import { buildReminder } from './smsParser';
import { cleanSmsPhone, sendSilently, silentSmsAvailable } from './smsSend';

// One send per customer at a time: a second transaction saved while the first
// SMS is still in flight must not produce a duplicate.
const inFlight = new Set();

/**
 * Shop details and a usable customer phone are both required to build and send
 * a reminder. A customer whose «ارسال پیامک یادآوری» switch is off never gets
 * an automatic SMS.
 */
export function reminderReady(contact, settings) {
  return {
    settingsReady: Boolean(settings && settings.myName && settings.cardNumber),
    hasPhone:
      Boolean(contact) &&
      contact.reminderEnabled !== false &&
      Boolean(cleanSmsPhone(contact.phone)),
  };
}

/**
 * Called by ContactsContext right after a transaction mutation is committed.
 * Fire-and-forget: always resolves to { ok, reason } and never throws.
 *
 * @param {object}   input
 * @param {object}   input.contact      the contact AFTER the mutation
 * @param {number}   input.balance      balanceOf(contact) in ledger units
 * @param {object}   input.settings     useSettings().settings
 * @param {Function} input.setSmsSentForCurrentDebt  latch writer
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function autoSendReminder({
  contact,
  balance,
  settings,
  setSmsSentForCurrentDebt,
}) {
  if (!contact) return { ok: false, reason: 'no-contact' };

  const { settingsReady, hasPhone } = reminderReady(contact, settings);
  const action = reminderAction({
    balance,
    sentForCurrentDebt: contact.smsSentForCurrentDebt,
    settingsReady,
    hasPhone,
  });
  // 'none' (already sent for this debt) or 'reset' (payment brought it back
  // down) — both mean: do not send now.
  if (action !== 'send') return { ok: false, reason: action };

  if (!silentSmsAvailable) return { ok: false, reason: 'unavailable' };
  if (inFlight.has(contact.id)) return { ok: false, reason: 'busy' };

  const message = buildReminder({
    customerName: contact.name,
    amount: balance, // buildReminder converts ledger units → Toman
    cardNumber: settings.cardNumber,
    myName: settings.myName,
  });

  inFlight.add(contact.id);
  try {
    const result = await sendSilently(contact.phone, message);
    if (result.ok) {
      // Latch ONLY on a real send — a failed send must be retried on the next
      // transaction instead of being silently swallowed forever.
      setSmsSentForCurrentDebt(contact.id, true);
      return { ok: true, reason: 'sent' };
    }
    return { ok: false, reason: result.reason || 'error' };
  } catch (error) {
    return { ok: false, reason: 'error' };
  } finally {
    inFlight.delete(contact.id);
  }
}
