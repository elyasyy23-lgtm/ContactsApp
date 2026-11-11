import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, shadows } from '../theme';
import { money, parseAmount, toFa } from '../utils/format';
import { parseBankSms } from '../utils/smsParser';
import { balanceOf, TRANSACTION, useContacts } from '../store/ContactsContext';
import { useSmsInbox } from '../store/SmsInboxContext';
import { Avatar, ScreenHeader } from '../components/ui';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

export default function SmsImportScreen({ navigation }) {
  useLang(); // re-render when the app language changes
  const insets = useSafeAreaInsets();
  const { contacts, addTransaction } = useContacts();
  const {
    available: smsAvailable,
    enabled: smsEnabled,
    pending,
    recordPending,
    dismissPending,
    scanNow,
    busy: smsBusy,
  } = useSmsInbox();

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [type, setType] = useState(TRANSACTION.PAYMENT);
  const [amount, setAmount] = useState('');
  const [assignFor, setAssignFor] = useState(null);

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => balanceOf(b) - balanceOf(a)),
    [contacts],
  );

  const analyze = () => {
    const result = parseBankSms(text);
    setParsed(result);
    if (result.ok) {
      setAmount(String(result.amount));
      setType(result.direction === 'out' ? TRANSACTION.CREDIT : TRANSACTION.PAYMENT);
    } else {
      setAmount('');
    }
  };

  const orderedFor = (item) => {
    const candidates = new Set(item.candidateIds || []);
    return [...sortedContacts].sort((a, b) => {
      const rankA = candidates.has(a.id) ? 0 : 1;
      const rankB = candidates.has(b.id) ? 0 : 1;
      return rankA - rankB;
    });
  };

  const assignPending = (item, contact) => {
    const ok = recordPending(item.id, contact.id);
    setAssignFor(null);
    if (ok) {
      Alert.alert(
        t('ثبت شد'),
        t('واریز {amount} تومان برای «{name}» به‌عنوان دریافت وجه ثبت شد.', {
          amount: money(item.amount ?? item.amountToman ?? 0),
          name: contact.name,
        }),
      );
    }
  };

  const record = (contact) => {
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      Alert.alert(t('مبلغ نامعتبر'), t('مبلغ تراکنش را وارد یا اصلاح کنید.'));
      return;
    }
    const label = type === TRANSACTION.PAYMENT ? t('دریافت وجه') : t('ثبت بدهی');
    Alert.alert(
      t('ثبت تراکنش'),
      t('{label} به مبلغ {amount} تومان برای «{name}» ثبت شود؟', {
        label,
        amount: money(value),
        name: contact.name,
      }),
      [
        { text: t('انصراف'), style: 'cancel' },
        {
          text: t('ثبت'),
          onPress: () => {
            addTransaction(contact.id, {
              type,
              amount: String(value),
              note: parsed && parsed.bank ? `پیامک ${parsed.bank}` : 'پیامک بانکی',
            });
            navigation.goBack();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('ثبت از پیامک')}
        subtitle={t('پیامک بانکی را بچسبانید')}
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {pending.length > 0 ? (
            <View style={styles.pendingWrap}>
              <View style={styles.pendingHead}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                  <Ionicons name="mail-unread-outline" size={16} color={colors.amber} />
                  <Text style={styles.pendingTitle}>
                    {t('{n} واریز در انتظار تأیید', { n: toFa(pending.length) })}
                  </Text>
                </View>
                {smsAvailable ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.refreshBtn}
                    onPress={() => scanNow()}
                    disabled={smsBusy}
                  >
                    <Ionicons name="refresh" size={15} color={colors.primary} />
                    <Text style={styles.refreshText}>
                      {smsBusy ? t('بررسی…') : t('بررسی دوباره')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {pending.map((item) => (
                <View key={item.key} style={styles.pendingCard}>
                  <View style={styles.pendingTop}>
                    <Text style={styles.pendingAmount}>
                      {money(item.amount ?? item.amountToman ?? 0)} {t('تومان')}
                    </Text>
                    <Text style={styles.pendingMeta}>
                      {item.bank ? t('بانک {bank}', { bank: item.bank }) : 'پیامک بانکی'}
                      {item.card ? t(' • کارت •••• {last4}', { last4: toFa(item.card) }) : ''}
                    </Text>
                  </View>

                  <Text style={styles.pendingBody} numberOfLines={2}>
                    {item.body}
                  </Text>

                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.pendingBtn}
                      onPress={() =>
                        setAssignFor(assignFor === item.key ? null : item.key)
                      }
                    >
                      <Ionicons name="person-add-outline" size={15} color={colors.white} />
                      <Text style={styles.pendingBtnText}>
                        {assignFor === item.key ? t('بستن فهرست') : t('انتخاب مشتری')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.pendingDismiss}
                      onPress={() => dismissPending(item.id)}
                    >
                      <Ionicons name="close" size={16} color={colors.muted} />
                      <Text style={styles.pendingDismissText}>{t('نادیده گرفتن')}</Text>
                    </TouchableOpacity>
                  </View>

                  {assignFor === item.key ? (
                    <View style={styles.pendingPicker}>
                      {orderedFor(item).map((contact) => (
                        <TouchableOpacity
                          key={contact.id}
                          activeOpacity={0.85}
                          style={styles.contactRow}
                          onPress={() => assignPending(item, contact)}
                        >
                          <Avatar letter={contact.letter} size={40} />
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={styles.contactName} numberOfLines={1}>
                              {contact.name}
                            </Text>
                            <Text style={styles.contactMeta} numberOfLines={1}>
                              {t('بدهی: {amount} تومان', {
                                amount: money(Math.max(balanceOf(contact), 0)),
                              })}
                            </Text>
                          </View>
                          <Ionicons name="chevron-back" size={18} color={colors.muted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="information" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.infoTitle}>
                {smsAvailable ? t('ثبت خودکار فعال است') : t('چرا خودکار خوانده نمی‌شود؟')}
              </Text>
              <Text style={styles.infoText}>
                {smsAvailable
                  ? smsEnabled
                    ? t('پیامک‌های بانکی خودکار خوانده می‌شوند. واریزهایی که مشتری‌شان با اطمینان مشخص شود، مستقیم ثبت می‌شوند و بقیه همین‌جا می‌مانند تا تأیید کنید. برای پیامک تکراری یا دستی هم می‌توانید متن را پایین بچسبانید.')
                    : t('دسترسی پیامک داده شده، اما ثبت خودکار خاموش است. از تنظیمات آن را روشن کنید تا واریزها بدون کار اضافه ثبت شوند.')
                  : t('در Expo Go دسترسی به صندوق پیامک وجود ندارد (نیازمند ماژول نیتیو و مجوز READ_SMS است). راه‌حل فعلی: پیامک بانک را کپی و همین‌جا بچسبانید؛ مبلغ (به تومان) و نوع تراکنش خودکار تشخیص داده می‌شود.')}
              </Text>
            </View>
          </View>

          <Text style={styles.label}>{t('متن پیامک')}</Text>
          <TextInput
            style={styles.smsInput}
            value={text}
            onChangeText={setText}
            placeholder={t('مثلاً: مبلغ 12,500,000 ریال واریز به حساب شما…')}
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity activeOpacity={0.88} style={styles.analyzeBtn} onPress={analyze}>
            <Ionicons name="scan-outline" size={18} color={colors.white} />
            <Text style={styles.analyzeText}>{t('تحلیل پیامک')}</Text>
          </TouchableOpacity>

          {parsed && !parsed.ok ? (
            <View style={styles.warnCard}>
              <Ionicons name="alert-circle-outline" size={17} color={colors.amber} />
              <Text style={styles.warnText}>
                {parsed.reason === 'empty'
                  ? t('متنی وارد نشده است.')
                  : t('مبلغی در متن پیدا نشد. می‌توانید مبلغ را دستی وارد کنید.')}
              </Text>
            </View>
          ) : null}

          {parsed && parsed.ok ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>{t('نتیجه تشخیص')}</Text>
                <View style={styles.bankPill}>
                  <Text style={styles.bankText}>
                    {parsed.bank ? t('بانک {bank}', { bank: parsed.bank }) : 'پیامک بانکی'}
                  </Text>
                </View>
              </View>

              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('مبلغ')}</Text>
                <Text style={styles.resultValue}>
                  {money(parseAmount(amount) || parsed.amount)} {t('تومان')}
                </Text>
              </View>

              {parsed.card ? (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>{t('کارت')}</Text>
                  <Text style={styles.resultValue}>•••• {toFa(parsed.card)}</Text>
                </View>
              ) : null}

              <View style={styles.typeRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.typeBtn,
                    type === TRANSACTION.PAYMENT && styles.typeBtnGreen,
                  ]}
                  onPress={() => setType(TRANSACTION.PAYMENT)}
                >
                  <Ionicons
                    name="arrow-down"
                    size={15}
                    color={type === TRANSACTION.PAYMENT ? colors.white : colors.green}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      { color: type === TRANSACTION.PAYMENT ? colors.white : colors.green },
                    ]}
                  >
                    {t('دریافت وجه')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.typeBtn,
                    type === TRANSACTION.CREDIT && styles.typeBtnRed,
                  ]}
                  onPress={() => setType(TRANSACTION.CREDIT)}
                >
                  <Ionicons
                    name="arrow-up"
                    size={15}
                    color={type === TRANSACTION.CREDIT ? colors.white : colors.red}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      { color: type === TRANSACTION.CREDIT ? colors.white : colors.red },
                    ]}
                  >
                    {t('ثبت بدهی')}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('اصلاح مبلغ (اختیاری)')}</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.muted}
              />
            </View>
          ) : null}

          {parsed && parsed.ok ? (
            <>
              <Text style={styles.pickTitle}>این تراکنش برای کدام مشتری است؟</Text>
              {sortedContacts.map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  activeOpacity={0.85}
                  style={styles.contactRow}
                  onPress={() => record(contact)}
                >
                  <Avatar letter={contact.letter} size={40} />
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.contactName} numberOfLines={1}>
                      {contact.name}
                    </Text>
                    <Text style={styles.contactMeta} numberOfLines={1}>
                      {contact.phone ? toFa(contact.phone) : t('بدون شماره')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },

  infoCard: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 16,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: colors.primaryDark, ...rtl },
  infoText: { fontSize: 11.5, color: '#5A4A86', lineHeight: 19, marginTop: 5, ...rtl },

  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSoft, marginBottom: 7, ...rtl },
  smsInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 110,
    fontSize: 13.5,
    color: colors.text,
    lineHeight: 22,
    textAlign: 'right',
    ...shadows.card,
  },

  analyzeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 50,
    marginTop: 14,
    ...shadows.card,
  },
  analyzeText: { color: colors.white, fontSize: 15, fontWeight: '800', marginRight: 7 },

  warnCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  warnText: { flex: 1, fontSize: 12, color: '#8A6417', marginRight: 8, ...rtl },

  resultCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 15,
    marginTop: 16,
    ...shadows.card,
  },
  resultHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resultTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, ...rtl },
  bankPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bankText: { fontSize: 10.5, fontWeight: '800', color: colors.primary },

  resultRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultLabel: { fontSize: 12, color: colors.muted, ...rtl },
  resultValue: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },

  typeRow: { flexDirection: 'row-reverse', marginTop: 12, marginBottom: 6 },
  typeBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 10,
    marginLeft: 8,
  },
  typeBtnGreen: { backgroundColor: colors.green },
  typeBtnRed: { backgroundColor: colors.red },
  typeText: { fontSize: 12.5, fontWeight: '800', marginRight: 5 },

  amountInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },

  pickTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
    marginTop: 20,
    marginBottom: 10,
    ...rtl,
  },
  pendingWrap: { marginBottom: 16 },
  pendingHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  pendingTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginRight: 6, ...rtl },
  refreshBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refreshText: { fontSize: 10.5, fontWeight: '800', color: colors.primary, marginRight: 4 },
  pendingCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 13,
    marginBottom: 10,
    ...shadows.card,
  },
  pendingTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingAmount: { fontSize: 15, fontWeight: '800', color: colors.green, ...rtl },
  pendingMeta: { fontSize: 10.5, color: colors.muted, ...rtl },
  pendingBody: {
    fontSize: 11.5,
    color: colors.textSoft,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pendingActions: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 10 },
  pendingBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 40,
    marginLeft: 8,
  },
  pendingBtnText: { color: colors.white, fontSize: 12.5, fontWeight: '800', marginRight: 6 },
  pendingDismiss: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 40,
  },
  pendingDismissText: { fontSize: 11.5, color: colors.muted, marginRight: 3 },
  pendingPicker: { marginTop: 10 },

  contactRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 11,
    marginBottom: 9,
    ...shadows.card,
  },
  contactName: { fontSize: 14, fontWeight: '800', color: colors.text, ...rtl },
  contactMeta: { fontSize: 11, color: colors.muted, marginTop: 3, ...rtl },
});
