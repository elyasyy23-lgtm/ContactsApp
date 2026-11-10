// MANUAL reminder sender — the fallback button. The normal path is AUTOMATIC:
// `src/utils/reminderAuto.js` fires from the transaction save inside
// ContactsContext the moment a credit pushes the debt above the threshold.
// This module exists for the cases the automatic path cannot handle (Expo Go
// with no native module, denied SEND_SMS, or a customer whose reminder switch
// was turned on after the debt already crossed): the tap is the trigger, and
// silent-first stays the default. The composer is only a fallback for Expo Go
// (no native module) or when SEND_SMS was denied.
//
// Shared by CustomerDetailScreen and DebtorsScreen so the rules can never
// drift between them:
//   1. per-customer toggle (contact.reminderEnabled === false) → blocked
//   2. shop settings incomplete → blocked, offered a jump to Settings
//   3. no usable phone → blocked, offered a jump to the customer form
//   4. once-per-debt latch: already sent for this debt → blocked
//   5. silent send → latch set ONLY on success and only above the threshold
import { Alert, Linking, Platform, Share } from 'react-native';
import { REMINDER_THRESHOLD } from '../theme';
import { buildReminder } from './smsParser';
import { sendSilently } from './smsSend';

function editContact(navigate, contactId) {
  navigate('CustomerForm', { contactId });
}

/** Opens the messaging app pre-filled (fallback when silent is impossible). */
async function composerFallback(phone, message) {
  // iOS wants "&body=", Android wants "?body=".
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
  try {
    // No canOpenURL() check: Android 11 package visibility makes it unreliable.
    await Linking.openURL(url);
    return true;
  } catch (error) {
    try {
      await Share.share({ message });
      return true;
    } catch (shareError) {
      Alert.alert('باز کردن پیامک ممکن نشد', 'هیچ برنامه پیام‌رسانی روی این گوشی پیدا نشد.');
      return false;
    }
  }
}

/**
 * Send the reminder for ONE customer after a manual button tap.
 *
 * @param {object}   input
 * @param {object}   input.contact                 the customer record
 * @param {number}   input.balance                 balanceOf(contact) in ledger units
 * @param {object}   input.settings                useSettings().settings
 * @param {Function} input.setSmsSentForCurrentDebt from useContacts()
 * @param {Function} input.navigate                screen's navigation.navigate
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function sendManualReminder({
  contact,
  balance,
  settings,
  setSmsSentForCurrentDebt,
  navigate,
}) {
  if (!contact) return { ok: false, reason: 'no-contact' };

  // 1) Per-customer switch is OFF → blocked, offer the fix in the form.
  if (contact.reminderEnabled === false) {
    Alert.alert(
      'ارسال پیامک خاموش است',
      'ارسال پیامک یادآوری برای این مشتری در فرم مشتری خاموش شده است.',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'ویرایش مشتری', onPress: () => editContact(navigate, contact.id) },
      ],
    );
    return { ok: false, reason: 'disabled' };
  }

  // 2) Shop details missing → the reminder template cannot be built.
  if (!settings.myName || !settings.cardNumber) {
    Alert.alert(
      'نیاز به اطلاعات فروشگاه',
      'برای ارسال یادآوری، نام خود و شماره کارت را در تنظیمات وارد کنید.',
      [
        { text: 'بعداً', style: 'cancel' },
        { text: 'باز کردن تنظیمات', onPress: () => navigate('Settings') },
      ],
    );
    return { ok: false, reason: 'settings' };
  }

  // 3) No usable phone number.
  const phone = String(contact.phone || '').replace(/[^0-9+]/g, '');
  if (!phone) {
    Alert.alert(
      'شماره موبایل ثبت نشده',
      'برای ارسال یادآوری، شماره موبایل این مشتری را وارد کنید.',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'ویرایش مشتری', onPress: () => editContact(navigate, contact.id) },
      ],
    );
    return { ok: false, reason: 'phone' };
  }

  // 4) Once-per-debt latch: already sent for this debt crossing.
  if (Number(balance) > REMINDER_THRESHOLD && contact.smsSentForCurrentDebt) {
    Alert.alert(
      'یادآوری این بدهی ارسال شده است',
      'برای این بدهی قبلاً پیامک یادآوری فرستاده شده است. پس از تسویه یا کاهش بدهی زیر حد، دوباره فعال می‌شود.',
    );
    return { ok: false, reason: 'latched' };
  }

  // 5) Build the exact template the shop owner specified, then send silently.
  const message = buildReminder({
    customerName: contact.name,
    amount: balance,
    cardNumber: settings.cardNumber,
    myName: settings.myName,
  });

  const result = await sendSilently(phone, message);

  if (result.ok) {
    // Latch only on success and only for real debts above the threshold —
    // a failed send leaves the button fully working.
    if (Number(balance) > REMINDER_THRESHOLD) {
      setSmsSentForCurrentDebt(contact.id, true);
    }
    Alert.alert('ارسال شد', 'پیامک یادآوری برای «' + contact.name + '» بدون باز شدن برنامه پیامک ارسال شد.');
    return { ok: true };
  }

  // 6) Silent was impossible → say why, offer the two escape hatches.
  if (result.reason === 'permission') {
    Alert.alert(
      'اجازه ارسال پیامک داده نشده',
      'اندروید اجازه ارسال مستقیم پیامک به این برنامه نداده است. می‌توانید اجازه را بدهید یا با برنامه پیامک بفرستید.',
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'ارسال با برنامه پیامک', onPress: () => composerFallback(phone, message) },
        { text: 'تنظیمات برنامه', onPress: () => Linking.openSettings() },
      ],
    );
    return { ok: false, reason: 'permission' };
  }

  if (result.reason === 'unavailable') {
    // Expo Go has no native SMS module — fall back to the composer so the
    // flow still works during development.
    const opened = await composerFallback(phone, message);
    if (opened && Number(balance) > REMINDER_THRESHOLD) {
      setSmsSentForCurrentDebt(contact.id, true);
    }
    return { ok: opened, reason: 'unavailable' };
  }

  Alert.alert(
    'ارسال نشد',
    'ارسال پیامک ممکن نشد؛ شبکه یا سیم‌کارت گوشی را بررسی کنید و دوباره تلاش کنید.',
  );
  return { ok: false, reason: result.reason || 'error' };
}
