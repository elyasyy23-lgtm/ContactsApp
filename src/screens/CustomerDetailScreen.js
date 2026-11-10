import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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

export default function CustomerDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { contactId } = route.params || {};
  const contact = useContact(contactId);
  const {
    addTransaction,
    updateTransaction,
    deleteTransaction,
    deleteContact,
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
        'شماره موبایل ثبت نشده',
        'برای تماس یا پیامک، شماره موبایل این مشتری را وارد کنید.',
        [
          { text: 'انصراف', style: 'cancel' },
          {
            text: 'ویرایش مشتری',
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
      Alert.alert('باز نشد', 'برنامه‌ای برای تماس یا پیامک روی این گوشی پیدا نشد.');
    }
  };

  const callCustomer = () => openPhoneApp('tel');
  const smsCustomer = () => openPhoneApp('sms');

  // Manual reminder — the ONLY trigger (owner decision 2026-11-10: no
  // auto-send anywhere, this screen included). Silent-first via SmsManager:
  // no messaging app, no Send button. All guards (per-customer switch, shop
  // details, phone, once-per-debt latch) and fallbacks live in the shared
  // sender used by both this screen and the Debtors screen.
  const sendReminder = () =>
    sendManualReminder({
      contact,
      balance,
      settings,
      setSmsSentForCurrentDebt,
      navigate: navigation.navigate,
    });

  // The once-per-debt latch itself (`smsSentForCurrentDebt`) is cleared by
  // ContactsContext on every transaction change (settleReminderLatch), so a
  // payment — even one auto-imported from a bank SMS — re-arms the button
  // without any screen needing to be open.

  if (!contact) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="مشتری" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="person-outline"
          title="مشتری پیدا نشد"
          hint="ممکن است حذف شده باشد."
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
      'حذف تراکنش',
      `${isPayment ? 'دریافت وجه' : 'ثبت بدهی'} به مبلغ ${money(item.amount)} تومان حذف شود؟`,
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'ویرایش', onPress: () => openSheet(item.type, item) },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => deleteTransaction(contact.id, item.id),
        },
      ],
    );
  };

  const confirmDeleteContact = () => {
    Alert.alert('حذف مشتری', `«${contact.name}» با تمام تراکنش‌ها حذف شود؟`, [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          deleteContact(contact.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const renderTransaction = (item) => {
    const isPayment = item.type === TRANSACTION.PAYMENT;
    const stamp = item.createdAt
      ? dateTime(item.createdAt)
      : { date: item.date || '', time: item.time || '' };
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.8}
        delayLongPress={350}
        style={styles.transaction}
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
            {isPayment ? 'دریافت وجه' : 'ثبت بدهی'}
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

        <Text
          style={[
            styles.transactionAmount,
            { color: isPayment ? colors.green : colors.red },
          ]}
        >
          {isPayment ? '−' : '+'} {money(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={contact.name}
        subtitle={contact.phone ? toFa(contact.phone) : 'بدون شماره تلفن'}
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
              <Text style={styles.balanceLabel}>مانده حساب</Text>
              <Text
                style={[
                  styles.balanceValue,
                  {
                    color:
                      balance > 0 ? colors.red : balance < 0 ? colors.green : colors.text,
                  },
                ]}
              >
                {money(balance)} تومان
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
                {balance > 0 ? 'بدهکار' : balance < 0 ? 'بستانکار' : 'تسویه شده'}
              </Text>
            </View>
          </View>

          <View style={styles.balanceStats}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>کل دریافت‌شده</Text>
              <Text style={[styles.statValue, { color: colors.green }]}>
                {money(totals.paid)}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>کل بدهی</Text>
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
              <Text style={styles.quickText}>تماس</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.quickBtn}
              onPress={smsCustomer}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
              <Text style={styles.quickText}>پیامک</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {needsReminder ? (
          <View style={styles.reminderBanner}>
            <View style={styles.reminderIcon}>
              <Ionicons name="notifications" size={18} color={colors.white} />
            </View>
            <View style={styles.reminderTextWrap}>
              <Text style={styles.reminderTitle}>بدهی بالای {money(REMINDER_THRESHOLD * TOMAN_PER_UNIT)} تومان</Text>
              <Text style={styles.reminderText}>
                {contact.reminderEnabled === false
                  ? 'ارسال پیامک یادآوری برای این مشتری خاموش شده است (از فرم مشتری).'
                  : settingsReady
                    ? 'با دکمه ارسال، پیامک بی‌صدا و بدون باز شدن برنامه پیامک فرستاده می‌شود.'
                    : 'برای ارسال یادآوری، نام و شماره کارت را در تنظیمات وارد کنید.'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.reminderBtn}
              onPress={() => (settingsReady ? sendReminder() : openSettings())}
            >
              <Text style={styles.reminderBtnText}>
                {settingsReady ? 'ارسال یادآوری' : 'تنظیمات'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <ActionButton
            label="دریافت وجه"
            icon="arrow-down"
            tone="green"
            onPress={() => openSheet(TRANSACTION.PAYMENT)}
          />
          <View style={{ width: 10 }} />
          <ActionButton
            label="ثبت بدهی"
            icon="arrow-up"
            tone="red"
            onPress={() => openSheet(TRANSACTION.CREDIT)}
          />
        </View>

        {balance > 0 && contact.reminderEnabled !== false ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.reminderGhost}
            onPress={() => sendReminder()}
          >
            <Ionicons name="paper-plane-outline" size={15} color={colors.primary} />
            <Text style={styles.reminderGhostText}>
              {needsReminder ? 'ارسال پیامک یادآوری' : 'ارسال پیامک تسویه'}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>تراکنش‌ها</Text>
          <Text style={styles.sectionCount}>{toFa(transactions.length)} مورد</Text>
        </View>

        {transactions.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="هنوز تراکنشی ثبت نشده"
            hint="با دکمه‌های بالا اولین دریافت یا بدهی را ثبت کنید."
          />
        ) : (
          <>
            <Text style={styles.transactionHint}>
              برای حذف، انگشت را روی تراکنش نگه دارید.
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
          <Text style={styles.deleteContactText}>حذف این مشتری</Text>
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
    padding: 12,
    marginBottom: 9,
    ...shadows.card,
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
  transactionAmount: { fontSize: 13.5, fontWeight: '800' },

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
