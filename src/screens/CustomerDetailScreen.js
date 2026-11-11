import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  faText,
  radius,
  rtl,
  rtlCenter,
  shadows,
  REMINDER_THRESHOLD,
  TOMAN_PER_UNIT,
} from '../theme';
import { dateTime, money, toFa } from '../utils/format';
import { sendManualReminder } from '../utils/reminderSend';
import { REMINDER_UI, reminderUiState } from '../utils/reminderUi';
import {
  cleanSmsPhone,
  hasSendPermission,
  requestSendPermission,
  silentSmsAvailable,
} from '../utils/smsSend';
import {
  balanceOf,
  TRANSACTION,
  useContact,
  useContacts,
} from '../store/ContactsContext';
import { useSettings } from '../store/SettingsContext';
import { useProfiles } from '../store/ProfilesContext';
import {
  ActionButton,
  Avatar,
  EmptyState,
  IconButton,
  ScreenHeader,
} from '../components/ui';
import AmountSheet from '../components/AmountSheet';
import { buildReceipt, canShare } from '../utils/share';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

/** One line explaining what the reminder banner is doing for this debt. */
function reminderHintFor(mode) {
  switch (mode) {
    case REMINDER_UI.OFF:
      return t('ارسال پیامک یادآوری برای این مشتری خاموش شده است (از فرم مشتری).');
    case REMINDER_UI.SENT:
      return t('یادآوری خودکار این بدهی ارسال شد؛ برای همین بدهی پیامک دیگری فرستاده نمی‌شود.');
    case REMINDER_UI.ARMED:
      return t('یادآوری خودکار فعال است — پیامک بی‌صدا و بدون باز شدن برنامه پیامک ارسال می‌شود.');
    case REMINDER_UI.PERMISSION:
      return t('برای ارسال خودکار، یک بار اجازه ارسال پیامک لازم است.');
    case REMINDER_UI.SETTINGS:
      return t('نام و شماره کارت را در تنظیمات وارد کنید تا ارسال خودکار فعال شود.');
    case REMINDER_UI.PHONE:
      return t('برای این مشتری شماره موبایل ثبت نشده است.');
    case REMINDER_UI.UNAVAILABLE:
      return t('ارسال خودکار در این نسخه ممکن نیست — با دکمه، پیامک را بفرستید.');
    default:
      return '';
  }
}

export default function CustomerDetailScreen({ navigation, route }) {
  useLang(); // re-render when the app language changes
  const insets = useSafeAreaInsets();
  const { contactId } = route.params || {};
  const contact = useContact(contactId);
  const {
    addTransaction,
    updateTransaction,
    deleteTransaction,
    deleteContact,
    attemptAutoReminder,
    setSmsSentForCurrentDebt,
  } = useContacts();
  const { settings } = useSettings();
  const { profileById } = useProfiles();

  const [sheet, setSheet] = useState({
    visible: false,
    mode: TRANSACTION.PAYMENT,
    editing: null,
  });

  const balance = balanceOf(contact);
  const settingsReady = Boolean(settings.myName && settings.cardNumber);

  const transactions = useMemo(() => {
    if (!contact) return [];
    return contact.transactions
      .map((t, index) => ({ ...t, _index: index }))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : null;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : null;
        if (ta !== null && tb !== null) return tb - ta;
        if (ta !== null) return -1;
        if (tb !== null) return 1;
        return b._index - a._index; // legacy rows: newest stored last
      });
  }, [contact]);

  const totals = useMemo(() => {
    let paid = 0;
    let credited = 0;
    transactions.forEach((t) => {
      if (t.type === TRANSACTION.PAYMENT) paid += Number(t.amount) || 0;
      else credited += Number(t.amount) || 0;
    });
    return { paid, credited };
  }, [transactions]);

  const openSettings = () => navigation.navigate('Settings');

  // Quick actions: phone icon → dialer, SMS icon → messaging app.
  const openPhoneApp = async (scheme) => {
    const phone = (contact.phone || '').replace(/[^0-9+]/g, '');
    if (!phone) {
      Alert.alert(
        t('شماره موبایل ثبت نشده'),
        t('برای تماس یا پیامک، شماره موبایل این مشتری را وارد کنید.'),
        [
          { text: t('انصراف'), style: 'cancel' },
          {
            text: t('ویرایش مشتری'),
            onPress: () =>
              navigation.navigate('CustomerForm', { contactId: contact.id }),
          },
        ],
      );
      return;
    }
    try {
      // Android 11 package visibility makes canOpenURL() unreliable — just try.
      await Linking.openURL(`${scheme}:${phone}`);
    } catch {
      Alert.alert(t('باز نشد'), t('برنامه‌ای برای تماس یا پیامک روی این گوشی پیدا نشد.'));
    }
  };

  const callCustomer = () => openPhoneApp('tel');
  const smsCustomer = () => openPhoneApp('sms');

  // Automatic reminder (owner decision 2026-11-10): the SMS fires BY ITSELF
  // from the transaction save path in ContactsContext — the moment a credit
  // pushes the debt above the threshold. No button is needed for that case and
  // none is shown (see `reminderUiState`): the banner only reports the state.
  //
  // A manual button survives as a FALLBACK for the cases the automatic path
  // cannot send: missing shop details, a customer without a phone, a denied
  // SEND_SMS permission, or Expo Go (no native module). Each fallback is a
  // one-tap fix instead of a generic «ارسال یادآوری» button.
  const sendReminder = () =>
    sendManualReminder({
      contact,
      balance,
      settings,
      setSmsSentForCurrentDebt,
      navigate: navigation.navigate,
    });

  // SEND_SMS is checked WITHOUT a dialog (the automatic path must never pop
  // one up by itself). Re-checked when the screen regains focus so a permission
  // granted from system settings is picked up immediately.
  const [smsPermission, setSmsPermission] = useState(false);
  const refreshPermission = useCallback(() => {
    let alive = true;
    hasSendPermission().then((granted) => {
      if (alive) setSmsPermission(granted);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => refreshPermission(), [refreshPermission]);

  const grantPermission = async () => {
    const granted = await requestSendPermission();
    setSmsPermission(granted);
    if (granted && contact) {
      // The debt already crossed while the permission was missing — send now.
      attemptAutoReminder(contact.id);
    }
  };

  // The once-per-debt latch (`smsSentForCurrentDebt`) is cleared by
  // ContactsContext on every transaction change (settleReminderLatch), so a
  // payment — even one auto-imported from a bank SMS — re-arms the next
  // crossing without any screen needing to be open.

  // What this debt's reminder control may look like (pure, unit-tested).
  // 'armed' / 'sent' = the automatic sender owns the job → NO manual button.
  const reminderUi = reminderUiState({
    balance,
    sentForCurrentDebt: contact ? contact.smsSentForCurrentDebt : false,
    reminderEnabled: contact ? contact.reminderEnabled !== false : true,
    settingsReady,
    hasPhone: contact ? Boolean(cleanSmsPhone(contact.phone)) : false,
    silentAvailable: silentSmsAvailable,
    permissionGranted: smsPermission,
  });

  // Recovery: this debt crossed while automatic sending was impossible (shop
  // details were empty, permission denied, app updated over old debts). Now
  // that everything is in place, send it once — the latch and the in-flight
  // guard make this idempotent, so re-focusing the screen sends nothing extra.
  const autoArmed = reminderUi.mode === REMINDER_UI.ARMED;
  useEffect(() => {
    if (!autoArmed || !contact) return;
    attemptAutoReminder(contact.id);
  }, [autoArmed, contact, attemptAutoReminder]);

  if (!contact) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t('مشتری')} onBack={() => navigation.goBack()} />
        <EmptyState
          icon="person-outline"
          title={t('مشتری پیدا نشد')}
          hint={t('ممکن است حذف شده باشد.')}
        />
      </View>
    );
  }

  const profile = contact ? profileById(contact.profileId || '') : null;
  const needsReminder = balance > REMINDER_THRESHOLD;

  const openSheet = (mode, editing = null) =>
    setSheet({ visible: true, mode, editing });

  const closeSheet = () => setSheet((s) => ({ ...s, visible: false }));

  const handleSubmit = ({ amount, note }) => {
    if (sheet.editing) {
      updateTransaction(contact.id, sheet.editing.id, {
        type: sheet.mode,
        amount: String(amount),
        note,
      });
    } else {
      addTransaction(contact.id, {
        type: sheet.mode,
        amount: String(amount),
        note,
      });
    }
    closeSheet();
  };

  const handleDeleteTransaction = () => {
    if (sheet.editing) deleteTransaction(contact.id, sheet.editing.id);
    closeSheet();
  };

  // Long-press on a transaction row: confirm, then remove that one transaction.
  const confirmDeleteTransaction = (item) => {
    const isPayment = item.type === TRANSACTION.PAYMENT;
    Alert.alert(
      t('حذف تراکنش'),
      `${isPayment ? t('دریافت وجه') : t('ثبت بدهی')} به مبلغ ${money(item.amount)} تومان حذف شود؟`,
      [
        { text: t('انصراف'), style: 'cancel' },
        { text: t('ویرایش'), onPress: () => openSheet(item.type, item) },
        {
          text: t('حذف'),
          style: 'destructive',
          onPress: () => deleteTransaction(contact.id, item.id),
        },
      ],
    );
  };

  const confirmDeleteContact = () => {
    Alert.alert(t('حذف مشتری'), `«${contact.name}» با تمام تراکنش‌ها حذف شود؟`, [
      { text: t('انصراف'), style: 'cancel' },
      {
        text: t('حذف'),
        style: 'destructive',
        onPress: () => {
          deleteContact(contact.id);
          navigation.goBack();
        },
      },
    ]);
  };

  // Send this one transaction to the customer as a receipt (WhatsApp, SMS…).
  const shareTransaction = async (item) => {
    const stamp = item.createdAt
      ? dateTime(item.createdAt)
      : { date: item.date || '', time: item.time || '' };
    const message = buildReceipt({
      shopName: settings.shopName,
      customerName: contact.name,
      type: item.type,
      amount: item.amount,
      date: stamp.date,
      time: stamp.time,
      note: item.note,
      balance,
    });
    if (!canShare(message)) return;
    try {
      // Text share only — no file, no extra permission: this works in Expo Go
      // and in the APK alike (react-native Share → Android ACTION_SEND).
      await Share.share({ message });
    } catch (error) {
      Alert.alert(t('اشتراک‌گذاری ممکن نشد'), t('این گوشی برنامه‌ای برای اشتراک‌گذاری ندارد.'));
    }
  };

  const renderTransaction = (item) => {
    const isPayment = item.type === TRANSACTION.PAYMENT;
    const stamp = item.createdAt
      ? dateTime(item.createdAt)
      : { date: item.date || '', time: item.time || '' };
    // The share button is a SIBLING of the row's own touchable, never a child:
    // on Android a nested Touchable's press is swallowed by the parent (the tap
    // silently opened the transaction sheet instead of the share sheet).
    return (
      <View key={item.id} style={styles.transaction}>
        <TouchableOpacity
          activeOpacity={0.8}
          delayLongPress={350}
          style={styles.transactionTap}
          onPress={() => openSheet(item.type, item)}
          onLongPress={() => confirmDeleteTransaction(item)}
        >
          <View
            style={[
              styles.transactionIcon,
              { backgroundColor: isPayment ? colors.greenSoft : colors.redSoft },
            ]}
          >
            <Ionicons
              name={isPayment ? 'arrow-down' : 'arrow-up'}
              size={16}
              color={isPayment ? colors.green : colors.red}
            />
          </View>

          <View style={styles.transactionMain}>
            <Text style={styles.transactionTitle}>
              {isPayment ? t('دریافت وجه') : t('ثبت بدهی')}
            </Text>
            <Text style={styles.transactionMeta}>
              {stamp.date}
              {stamp.time ? ` • ${stamp.time}` : ''}
            </Text>
            {item.note ? (
              <Text style={styles.transactionNote} numberOfLines={1}>
                {item.note}
              </Text>
            ) : null}
          </View>

          <View style={styles.transactionEnd}>
            <Text
              style={[
                styles.transactionAmount,
                { color: isPayment ? colors.green : colors.red },
              ]}
            >
              {isPayment ? '−' : '+'} {money(item.amount)}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={8}
          style={styles.transactionShare}
          onPress={() => shareTransaction(item)}
          accessibilityRole="button"
          accessibilityLabel={t('اشتراک‌گذاری رسید')}
        >
          <Ionicons name="share-social-outline" size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={contact.name}
        subtitle={contact.phone ? toFa(contact.phone) : t('بدون شماره تلفن')}
        onBack={() => navigation.goBack()}
        right={
          <IconButton
            name="create-outline"
            onPress={() =>
              navigation.navigate('CustomerForm', { contactId: contact.id })
            }
          />
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <Avatar
              letter={contact.letter}
              size={42}
              tone={needsReminder ? 'red' : 'purple'}
            />
            <View style={styles.balanceInfo}>
              <Text style={styles.balanceLabel}>{t('مانده حساب')}</Text>
              <Text
                style={[
                  styles.balanceValue,
                  {
                    color:
                      balance > 0 ? colors.red : balance < 0 ? colors.green : colors.text,
                  },
                ]}
              >
                {money(balance)} {t('تومان')}
              </Text>
              {profile ? (
                <View style={styles.profilePill}>
                  <Ionicons name="pricetag-outline" size={10} color={colors.primary} />
                  <Text style={styles.profilePillText}>{profile.name}</Text>
                </View>
              ) : null}
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    balance > 0
                      ? colors.redSoft
                      : balance < 0
                        ? colors.greenSoft
                        : colors.bg,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      balance > 0
                        ? colors.red
                        : balance < 0
                          ? colors.greenDark
                          : colors.muted,
                  },
                ]}
              >
                {balance > 0 ? t('بدهکار') : balance < 0 ? t('بستانکار') : t('تسویه شده')}
              </Text>
            </View>
          </View>

          <View style={styles.balanceStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('کل دریافت‌شده')}</Text>
              <Text style={[styles.statValue, { color: colors.green }]}>
                {money(totals.paid)}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('کل بدهی')}</Text>
              <Text style={[styles.statValue, { color: colors.red }]}>
                {money(totals.credited)}
              </Text>
            </View>
          </View>
        </View>

        {contact.phone ? (
          <View style={styles.quickRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.quickBtn}
              onPress={callCustomer}
            >
              <Ionicons name="call-outline" size={18} color={colors.primary} />
              <Text style={styles.quickText}>{t('تماس')}</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.quickBtn}
              onPress={smsCustomer}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
              <Text style={styles.quickText}>{t('پیامک')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {needsReminder ? (
          <View style={styles.reminderBanner}>
            <View style={styles.reminderIcon}>
              <Ionicons
                name={reminderUi.mode === REMINDER_UI.SENT ? 'checkmark' : 'notifications'}
                size={18}
                color={colors.white}
              />
            </View>
            <View style={styles.reminderTextWrap}>
              <Text style={styles.reminderTitle}>
                {t('بدهی بالای {amount} تومان', {
                  amount: money(REMINDER_THRESHOLD * TOMAN_PER_UNIT),
                })}
              </Text>
              <Text style={styles.reminderText}>{reminderHintFor(reminderUi.mode)}</Text>
            </View>
            {/* A button appears ONLY when the automatic sender cannot do it
                itself — one tap fixes the blocker, then the auto path resumes. */}
            {reminderUi.mode === REMINDER_UI.PERMISSION ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.reminderBtn}
                onPress={grantPermission}
              >
                <Text style={styles.reminderBtnText}>{t('اجازه ارسال')}</Text>
              </TouchableOpacity>
            ) : null}
            {reminderUi.mode === REMINDER_UI.SETTINGS ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.reminderBtn}
                onPress={openSettings}
              >
                <Text style={styles.reminderBtnText}>{t('تنظیمات')}</Text>
              </TouchableOpacity>
            ) : null}
            {reminderUi.mode === REMINDER_UI.PHONE ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.reminderBtn}
                onPress={() =>
                  navigation.navigate('CustomerForm', { contactId: contact.id })
                }
              >
                <Text style={styles.reminderBtnText}>{t('شماره')}</Text>
              </TouchableOpacity>
            ) : null}
            {reminderUi.mode === REMINDER_UI.UNAVAILABLE ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.reminderBtn}
                onPress={sendReminder}
              >
                <Text style={styles.reminderBtnText}>{t('ارسال دستی')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <ActionButton
            label={t('دریافت وجه')}
            icon="arrow-down"
            tone="green"
            onPress={() => openSheet(TRANSACTION.PAYMENT)}
          />
          <View style={{ width: 10 }} />
          <ActionButton
            label={t('ثبت بدهی')}
            icon="arrow-up"
            tone="red"
            onPress={() => openSheet(TRANSACTION.CREDIT)}
          />
        </View>

        {/* Above the threshold the banner owns the reminder (auto or its
            fallback), so no second send control is shown. Below it, a manual
            «پیامک تسویه» stays useful. */}
        {balance > 0 && !needsReminder && contact.reminderEnabled !== false ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.reminderGhost}
            onPress={() => sendReminder()}
          >
            <Ionicons name="paper-plane-outline" size={15} color={colors.primary} />
            <Text style={styles.reminderGhostText}>{t('ارسال پیامک تسویه')}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t('تراکنش‌ها')}</Text>
          <Text style={styles.sectionCount}>{t('{n} مورد', { n: toFa(transactions.length) })}</Text>
        </View>

        {transactions.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={t('هنوز تراکنشی ثبت نشده')}
            hint={t('با دکمه‌های بالا اولین دریافت یا بدهی را ثبت کنید.')}
          />
        ) : (
          <>
            <Text style={styles.transactionHint}>
              {t('برای حذف، انگشت را روی تراکنش نگه دارید.')}
            </Text>
            <View>{transactions.map(renderTransaction)}</View>
          </>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.deleteContact}
          onPress={confirmDeleteContact}
        >
          <Ionicons name="trash-outline" size={16} color={colors.red} />
          <Text style={styles.deleteContactText}>{t('حذف این مشتری')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <AmountSheet
        visible={sheet.visible}
        mode={sheet.mode}
        editing={!!sheet.editing}
        suggestAmount={balance > 0 ? balance : 0}
        initialAmount={sheet.editing ? sheet.editing.amount : ''}
        initialNote={sheet.editing ? sheet.editing.note : ''}
        onClose={closeSheet}
        onSubmit={handleSubmit}
        onDelete={handleDeleteTransaction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },

  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 16,
    ...shadows.card,
  },
  balanceTop: { flexDirection: 'row', alignItems: 'center' },
  balanceInfo: { flex: 1, marginLeft: 10 },
  balanceLabel: { fontSize: 12, color: colors.textSoft, fontWeight: '700', ...rtl },
  balanceValue: { fontSize: 21, fontWeight: '800', marginTop: 4, ...rtl },
  profilePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  profilePillText: { fontSize: 10, fontWeight: '800', color: colors.primary, marginRight: 4 },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: 11.5, fontWeight: '800' },

  balanceStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11, color: colors.muted, ...rtlCenter },
  statValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },

  reminderBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.redSoft,
    borderRadius: radius.lg,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F8CFCF',
  },
  reminderIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTextWrap: { flex: 1, marginRight: 10, marginLeft: 8 },
  reminderTitle: { fontSize: 12.5, fontWeight: '800', color: colors.redDark, ...rtl },
  reminderText: { fontSize: 11, color: '#B45757', marginTop: 3, lineHeight: 18, ...rtl },
  reminderBtn: {
    backgroundColor: colors.red,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reminderBtnText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },

  actionsRow: { flexDirection: 'row', marginTop: 14 },

  quickRow: { flexDirection: 'row', marginTop: 12 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 11,
  },
  quickText: { fontSize: 13, fontWeight: '800', color: colors.primary, marginRight: 6 },

  reminderGhost: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginTop: 10,
  },
  reminderGhostText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.primary,
    marginRight: 6,
  },

  sectionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, ...rtl },
  sectionCount: { fontSize: 11.5, color: colors.muted, fontWeight: '700', ...rtl },

  transaction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 8,
    marginBottom: 9,
    ...shadows.card,
  },
  transactionTap: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  transactionHint: {
    fontSize: 10.5,
    color: colors.muted,
    marginBottom: 8,
    paddingHorizontal: 4,
    ...rtl,
  },
  transactionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionMain: { flex: 1, marginRight: 10 },
  transactionTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },
  transactionMeta: { fontSize: 11, color: colors.muted, marginTop: 3, ...rtl },
  transactionNote: {
    fontSize: 11,
    color: colors.textSoft,
    marginTop: 3,
    ...faText,
  },
  transactionEnd: { alignItems: 'flex-end' },
  transactionAmount: { fontSize: 13.5, fontWeight: '800' },
  transactionShare: { padding: 6 },

  deleteContact: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 13,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#F6DADA',
  },
  deleteContactText: { fontSize: 13, fontWeight: '800', color: colors.red, marginRight: 7 },
});
