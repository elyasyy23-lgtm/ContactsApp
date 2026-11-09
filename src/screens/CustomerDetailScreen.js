import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, faText, radius, rtl, rtlCenter, shadows, REMINDER_THRESHOLD } from '../theme';
import { dateTime, money, toFa } from '../utils/format';
import { buildReminder } from '../utils/smsParser';
import {
  balanceOf,
  TRANSACTION,
  useContact,
  useContacts,
} from '../store/ContactsContext';
import { useSettings } from '../store/SettingsContext';
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
  const { addTransaction, updateTransaction, deleteTransaction, deleteContact } =
    useContacts();
  const { settings } = useSettings();

  const [sheet, setSheet] = useState({
    visible: false,
    mode: TRANSACTION.PAYMENT,
    editing: null,
  });

  // Auto-reminder bookkeeping: fire once per customer+amount, never twice for
  // the same threshold crossing, and never after unmount.
  const firedRef = useRef(null);
  const timerRef = useRef(null);

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

  const openSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);

  const sendReminder = useCallback(
    async ({ silent = false } = {}) => {
      if (!contact) return;

      if (!settings.myName || !settings.cardNumber) {
        if (silent) return;
        Alert.alert(
          'نیاز به اطلاعات فروشگاه',
          'برای ارسال یادآوری، نام خود و شماره کارت را در تنظیمات وارد کنید.',
          [
            { text: 'بعداً', style: 'cancel' },
            { text: 'باز کردن تنظیمات', onPress: openSettings },
          ],
        );
        return;
      }

      const phone = (contact.phone || '').replace(/[^0-9+]/g, '');
      if (!phone) {
        if (silent) return;
        Alert.alert(
          'شماره موبایل ثبت نشده',
          'برای ارسال یادآوری، شماره موبایل این مشتری را وارد کنید.',
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

      // The exact Persian template the shop owner asked for.
      const message = buildReminder({
        customerName: contact.name,
        amountToman: balance,
        cardNumber: settings.cardNumber,
        myName: settings.myName,
      });

      // sms: with body= opens the messaging app pre-filled.
      // iOS wants "&body=", Android wants "?body=".
      const separator = Platform.OS === 'ios' ? '&' : '?';
      const url = `sms:${phone}${separator}body=${encodeURIComponent(message)}`;

      try {
        // No canOpenURL() check: Android 11 package visibility makes it unreliable.
        await Linking.openURL(url);
      } catch (error) {
        if (silent) return;
        try {
          await Share.share({ message });
        } catch (shareError) {
          Alert.alert(
            'باز کردن پیامک ممکن نشد',
            'هیچ برنامه پیام‌رسانی روی این گوشی پیدا نشد.',
          );
        }
      }
    },
    [contact, balance, settings, navigation, openSettings],
  );

  // Automatic reminder: as soon as a customer's debt passes 1,000,000 Toman —
  // either on opening the page or right after a transaction pushes it over —
  // the SMS composer opens once with the Persian message pre-filled.
  useEffect(() => {
    if (!contact || !settingsReady) return undefined;
    if (balance <= REMINDER_THRESHOLD) {
      firedRef.current = null;
      return undefined;
    }
    const key = `${contact.id}:${balance}`;
    if (firedRef.current === key || timerRef.current) return undefined;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      firedRef.current = key;
      sendReminder({ silent: true });
    }, 900);

    return undefined;
  }, [contact, balance, settingsReady, sendReminder]);

  // Cancel a pending auto-reminder when leaving the screen.
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

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
        style={styles.transaction}
        onPress={() => openSheet(item.type, item)}
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

        {needsReminder ? (
          <View style={styles.reminderBanner}>
            <View style={styles.reminderIcon}>
              <Ionicons name="notifications" size={18} color={colors.white} />
            </View>
            <View style={styles.reminderTextWrap}>
              <Text style={styles.reminderTitle}>بدهی بالای {money(REMINDER_THRESHOLD)} تومان</Text>
              <Text style={styles.reminderText}>
                {settingsReady
                  ? 'پیامک یادآوری به‌صورت خودکار آماده می‌شود.'
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

        {balance > 0 ? (
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
          <View>{transactions.map(renderTransaction)}</View>
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
