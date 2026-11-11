// Shop settings: my name, card number, shop name.
// These values feed the reminder SMS (card + owner name) and the home header.
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Share,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';
import { groupCard, money, toFa } from '../utils/format';
import { buildReminder } from '../utils/smsParser';
import { parseBackup } from '../utils/backup';
import { exportBackup, exportCsv, pickBackupFile } from '../utils/exports';
import { useSettings } from '../store/SettingsContext';
import { usePremium } from '../store/PremiumContext';
import { useContacts } from '../store/ContactsContext';
import { useProfiles } from '../store/ProfilesContext';
import { useSmsInbox } from '../store/SmsInboxContext';
import { ScreenHeader } from '../components/ui';
import { BUILD_STAMP } from '../buildInfo';
import { buildAppShareText, canShare } from '../utils/share';
import { LANGUAGES, t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

function Field({ label, icon, hint, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={17} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.muted}
          {...props}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function DataRow({ icon, tone, title, sub, onPress }) {
  const palette =
    tone === 'red'
      ? { bg: colors.redSoft, fg: colors.red, title: colors.red }
      : { bg: colors.primarySoft, fg: colors.primary, title: colors.text };
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.dataRow} onPress={onPress}>
      <View style={[styles.dataIcon, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={18} color={palette.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.dataTitle, { color: palette.title }]}>{title}</Text>
        <Text style={styles.dataSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-back" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ navigation }) {
  const { lang, setLang } = useLang(); // re-render when the app language changes
  const insets = useSafeAreaInsets();
  const { settings, saveSettings } = useSettings();
  const { premium, trialActive, trialDaysLeft } = usePremium();
  const { contacts, importContacts } = useContacts();
  const { profiles, importProfiles } = useProfiles();
  const {
    available: smsAvailable,
    enabled: smsEnabled,
    permission: smsPermission,
    pending: pendingSms,
    busy: smsBusy,
    enable: enableSms,
    disable: disableSms,
  } = useSmsInbox();

  const [myName, setMyName] = useState(settings.myName || '');
  const [cardNumber, setCardNumber] = useState(settings.cardNumber || '');
  const [shopName, setShopName] = useState(settings.shopName || '');

  const digits = cardNumber.replace(/\D/g, '');
  const cardValid = digits.length === 16;

  const preview = useMemo(
    () =>
      buildReminder({
        customerName: 'مشتری نمونه',
        amount: 1250,
        cardNumber: digits || '0000000000000000',
        myName: myName.trim() || 'نام شما',
      }),
    [digits, myName],
  );

  const toggleSms = async () => {
    if (smsEnabled) {
      await disableSms();
      return;
    }
    const result = await enableSms();
    if (result.ok) {
      Alert.alert(
        t('فعال شد'),
        result.readAllowed
          ? t('از این پس واریزهای بانکی به‌صورت خودکار برای مشتری ثبت می‌شوند.')
          : t('پیامک‌های جدید خودکار ثبت می‌شوند. برای بررسی پیامک‌های قبلی، اجازه «خواندن پیامک‌ها» را هم فعال کنید.'),
      );
      return;
    }
    if (result.reason === 'unavailable') {
      Alert.alert(
        t('نیازمند نسخه نصبی'),
        t('در Expo Go دسترسی به پیامک وجود ندارد. با نسخه APK (نسخه نهایی اپ) این قابلیت فعال می‌شود.'),
      );
      return;
    }
    Alert.alert(
      t('اجازه داده نشد'),
      t('برای این قابلیت، دسترسی به پیامک لازم است. از تنظیمات اندروید ← برنامه‌ها ← eKhata، مجوز SMS را فعال کنید.'),
    );
  };

  const smsState = !smsAvailable
    ? t('در Expo Go فعال نیست — نیازمند نسخه APK')
    : smsEnabled
      ? t('فعال — واریزها خودکار ثبت می‌شوند')
      : smsPermission === 'denied'
        ? t('اجازه دسترسی به پیامک داده نشده')
        : t('غیرفعال');

  // ── Backup & Data ────────────────────────────────────────────────────────
  // The file is handed to the Android share sheet; from there the user saves
  // it into Download (or sends it via WhatsApp/Telegram/Drive).
  const doBackup = async () => {
    const result = await exportBackup({ contacts, profiles, settings });
    if (result.ok) {
      Alert.alert(
        t('پشتیبان آماده شد'),
        t('فایل «{name}» ساخته شد. در پنجرهٔ اشتراک می‌توانید آن را در پوشه Download یا هر جای دیگر ذخیره کنید.', {
          name: result.name,
        }),
      );
    } else {
      Alert.alert(t('پشتیبان‌گیری ناموفق'), t('ساخت فایل پشتیبان ممکن نشد. دوباره تلاش کنید.'));
    }
  };

  const doRestore = async () => {
    const text = await pickBackupFile();
    if (!text) return; // canceled / unreadable — pickBackupFile already no-ops
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      Alert.alert(
        t('فایل نامعتبر'),
        t('این فایل یک پشتیبان معتبر eKhata نیست. باید فایلی باشد که از «پشتیبان‌گیری محلی» ساخته شده است.'),
      );
      return;
    }
    Alert.alert(
      t('بازیابی داده‌ها'),
      t('این فایل شامل {c} مشتری و {t} تراکنش است.\nداده‌های فعلی به‌کلی جایگزین می‌شوند.', {
        c: toFa(parsed.counts.contacts),
        t: toFa(parsed.counts.transactions),
      }),
      [
        { text: t('انصراف'), style: 'cancel' },
        {
          text: t('بازیابی'),
          style: 'destructive',
          onPress: () => {
            const count = importContacts(parsed.contacts);
            if (parsed.profiles) importProfiles(parsed.profiles);
            if (parsed.settings) {
              // appLock is NOT restored — it belongs to this phone's owner.
              saveSettings({
                myName: parsed.settings.myName,
                cardNumber: parsed.settings.cardNumber,
                shopName: parsed.settings.shopName,
              });
            }
            Alert.alert(
              t('بازیابی شد'),
              t('{n} مشتری و تراکنش‌هایش بازیابی شد.', { n: toFa(count) }),
            );
          },
        },
      ],
    );
  };

  const doCsv = async () => {
    const result = await exportCsv({ contacts, profiles });
    if (!result.ok) {
      Alert.alert(t('خروجی ناموفق'), t('ساخت فایل CSV ممکن نشد. دوباره تلاش کنید.'));
    }
  };

  const doClearAll = () => {
    Alert.alert(
      t('پاک کردن همه داده‌ها'),
      t('همه مشتریان و تراکنش‌هایشان برای همیشه حذف می‌شوند. این کار برگشت‌پذیر نیست.'),
      [
        { text: t('انصراف'), style: 'cancel' },
        {
          text: t('پاک کردن'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(t('تأیید نهایی'), t('مطمئنید؟ این کار قابل بازگشت نیست.'), [
              { text: t('انصراف'), style: 'cancel' },
              {
                text: t('بله، پاک کن'),
                style: 'destructive',
                onPress: () => {
                  importContacts([]);
                  Alert.alert(t('پاک شد'), t('همه مشتریان و تراکنش‌ها حذف شدند.'));
                },
              },
            ]);
          },
        },
      ],
    );
  };

  // ── App Lock (fingerprint / device PIN) ─────────────────────────────────
  const toggleAppLock = async (value) => {
    if (!value) {
      saveSettings({ appLock: false });
      return;
    }
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    if (!hasHardware || !enrolled) {
      Alert.alert(
        t('قفل در دسترس نیست'),
        t('روی این گوشی اثر انگشت یا رمز صفحه‌قفل فعال نیست. ابتدا آن را در تنظیمات اندروید فعال کنید.'),
      );
      return;
    }
    saveSettings({ appLock: true });
    Alert.alert(
      t('قفل فعال شد'),
      t('از این پس هنگام باز کردن برنامه، اثر انگشت یا رمز گوشی پرسیده می‌شود.'),
    );
  };

  // ── Share the app ────────────────────────────────────────────────────────
  const doShareApp = async () => {
    const message = buildAppShareText({ version: BUILD_STAMP });
    if (!canShare(message)) return;
    try {
      await Share.share({ message });
    } catch (error) {
      Alert.alert(t('اشتراک‌گذاری ممکن نشد'), t('این گوشی برنامه‌ای برای اشتراک‌گذاری ندارد.'));
    }
  };

  const save = () => {
    if (!myName.trim()) {
      Alert.alert(t('نام لازم است'), 'نام خود را وارد کنید تا در پیام یادآوری درج شود.');
      return;
    }
    if (!cardValid) {
      Alert.alert(t('شماره کارت نامعتبر'), t('شماره کارت باید ۱۶ رقم باشد.'));
      return;
    }
    saveSettings({ myName: myName.trim(), cardNumber: digits, shopName: shopName.trim() });
    Alert.alert(t('ذخیره شد'), t('اطلاعات فروشگاه با موفقیت ذخیره شد.'), [
      { text: t('باشه'), onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('تنظیمات')}
        subtitle={t('اطلاعات فروشگاه و شماره کارت')}
        onBack={() => navigation.goBack()}
        right={<Text style={styles.headerCount}>{t('{n} مشتری', { n: toFa(contacts.length) })}</Text>}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Field
              label={t('نام و نام خانوادگی شما')}
              icon="person-outline"
              value={myName}
              onChangeText={setMyName}
              placeholder={t('مثلاً محمد احمدی')}
              hint={t('این نام در پیام یادآوری، مقابل «به نام» درج می‌شود.')}
            />
            <Field
              label={t('شماره کارت')}
              icon="card-outline"
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="6037 9974 1234 5678"
              keyboardType="number-pad"
              maxLength={19}
              hint={
                digits.length > 0 && !cardValid
                  ? t('الان {n} رقم است؛ باید ۱۶ رقم باشد.', { n: toFa(digits.length) })
                  : t('مشتری مبلغ را به همین کارت واریز می‌کند.')
              }
            />
            <Field
              label={t('نام فروشگاه')}
              icon="storefront-outline"
              value={shopName}
              onChangeText={setShopName}
              placeholder={t('مثلاً سوپرمارکت احمدی')}
              hint={t('در بالای صفحه اصلی نمایش داده می‌شود.')}
            />
          </View>

          <Text style={styles.sectionTitle}>{t('زبان برنامه')}</Text>
          <View style={styles.langCard}>
            {LANGUAGES.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                style={[styles.langBtn, lang === item.id && styles.langBtnActive]}
                onPress={() => setLang(item.id)}
              >
                <Text
                  style={[styles.langText, lang === item.id && styles.langTextActive]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.langHint}>
            {t('تاریخ‌ها و اعداد با زبان انتخابی نمایش داده می‌شوند.')}
          </Text>

          <View style={styles.shareCard}>
            <DataRow
              icon="share-social-outline"
              tone="purple"
              title={t('اشتراک‌گذاری برنامه')}
              sub={t('لینک و توضیح برنامه را برای دیگران بفرستید')}
              onPress={doShareApp}
            />
          </View>

          <Text style={styles.sectionTitle}>{t('پیش‌نمایش پیام یادآوری')}</Text>
          <View style={styles.previewCard}>
            <View style={styles.previewHead}>
              <Ionicons name="chatbox-ellipses-outline" size={15} color={colors.primary} />
              <Text style={styles.previewTitle}>{t('متن ارسالی به مشتری')}</Text>
            </View>
            <Text style={styles.previewText}>{preview}</Text>
            <Text style={styles.previewMeta}>
              {t('بدهی نمونه: {amount} تومان • کارت: {card}', {
                amount: money(1250000),
                card: digits ? groupCard(digits) : '—',
              })}
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.88} style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
            <Text style={styles.saveText}>{t('ذخیره تنظیمات')}</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>{t('ثبت خودکار واریزها')}</Text>
          <View style={styles.smsCard}>
            <View style={styles.smsHead}>
              <View
                style={[
                  styles.smsIcon,
                  { backgroundColor: smsAvailable ? colors.greenSoft : colors.amberSoft },
                ]}
              >
                <Ionicons
                  name={smsAvailable ? 'chatbubbles-outline' : 'construct-outline'}
                  size={17}
                  color={smsAvailable ? colors.green : colors.amber}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.smsTitle}>{t('خواندن خودکار پیامک بانکی')}</Text>
                <Text style={styles.smsState}>{smsState}</Text>
              </View>
            </View>

            <Text style={styles.smsHint}>
              {smsAvailable
                ? t('هر واریزی که به کارت شما برسد، از متن پیامک بانک خوانده و به حساب همان مشتری ثبت می‌شود. اگر مشتری تشخیص داده نشود، در فهرست «در انتظار تأیید» می‌ماند.')
                : t('اندروید اجازه خواندن صندوق پیامک را فقط به اپ نصبی می‌دهد. پس از نصب APK این کلید فعال می‌شود و بقیه کارها خودکار است.')}
            </Text>

            {smsAvailable ? (
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.smsBtn, smsEnabled && styles.smsBtnOff]}
                onPress={toggleSms}
                disabled={smsBusy}
              >
                <Ionicons
                  name={smsEnabled ? 'close-circle-outline' : 'shield-checkmark-outline'}
                  size={17}
                  color={smsEnabled ? colors.red : colors.white}
                />
                <Text style={[styles.smsBtnText, smsEnabled && { color: colors.red }]}>
                  {smsBusy ? t('در حال بررسی…') : smsEnabled ? t('غیرفعال کردن') : t('فعال‌سازی خودکار')}
                </Text>
              </TouchableOpacity>
            ) : null}

            {pendingSms.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.smsPending}
                onPress={() => navigation.navigate('SmsImport')}
              >
                <Ionicons name="mail-unread-outline" size={15} color={colors.amber} />
                <Text style={styles.smsPendingText}>
                  {t('{n} پیامک در انتظار تأیید', { n: toFa(pendingSms.length) })}
                </Text>
                <Ionicons name="chevron-back" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.premiumRow}
            onPress={() => navigation.navigate('Premium')}
          >
            <View style={styles.premiumIcon}>
              <Ionicons name="diamond-outline" size={19} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumTitle}>{t('نسخه ویژه')}</Text>
              <Text style={styles.premiumSub}>
                {premium
                  ? t('فعال است — مشتری نامحدود')
                  : trialActive
                    ? t('دوره آزمایشی — {n} روز باقی‌مانده', { n: toFa(trialDaysLeft) })
                    : t('دوره آزمایشی به پایان رسیده — خرید نسخه کامل')}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={colors.muted} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>{t('پشتیبان‌گیری و داده‌ها')}</Text>
          <View style={styles.dataCard}>
            <DataRow
              icon="download-outline"
              tone="purple"
              title={t('پشتیبان‌گیری محلی')}
              sub={t('خروجی کامل مشتریان، تراکنش‌ها و تنظیمات (فایل JSON)')}
              onPress={doBackup}
            />
            <View style={styles.dataDivider} />
            <DataRow
              icon="cloud-upload-outline"
              tone="purple"
              title={t('بازیابی از فایل')}
              sub={t('بازگردانی داده‌ها از فایل پشتیبان')}
              onPress={doRestore}
            />
            <View style={styles.dataDivider} />
            <DataRow
              icon="grid-outline"
              tone="purple"
              title={t('خروجی CSV')}
              sub={t('فهرست مشتریان و مانده‌ها برای اکسل')}
              onPress={doCsv}
            />
            <View style={styles.dataDivider} />
            <DataRow
              icon="trash-outline"
              tone="red"
              title={t('پاک کردن همه داده‌ها')}
              sub={t('حذف همه مشتریان و تراکنش‌ها')}
              onPress={doClearAll}
            />
          </View>

          <View style={styles.lockCard}>
            <View style={styles.lockIcon}>
              <Ionicons name="lock-closed-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lockTitle}>{t('قفل برنامه')}</Text>
              <Text style={styles.lockSub}>
                {t('هنگام باز کردن برنامه، اثر انگشت یا رمز گوشی پرسیده می‌شود.')}
              </Text>
            </View>
            <Switch
              value={settings.appLock}
              onValueChange={toggleAppLock}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.appLock ? colors.primary : colors.white}
            />
          </View>

          <Text style={styles.footer}>
            {t('اطلاعات فقط روی همین گوشی ذخیره می‌شود و به هیچ سروری ارسال نمی‌گردد.')}
          </Text>
          <Text style={styles.buildStamp}>{t('eKhata — نسخه {v}', { v: BUILD_STAMP })}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  headerCount: { fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontWeight: '700', ...rtlCenter },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 16,
    ...shadows.card,
  },
  field: { marginBottom: 16 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSoft, marginBottom: 7, ...rtl },
  inputWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: colors.text,
    paddingVertical: 12,
    marginRight: 8,
    textAlign: 'right',
  },
  hint: { fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 18, ...rtl },

  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
    marginTop: 20,
    marginBottom: 10,
    paddingHorizontal: 4,
    ...rtl,
  },
  shareCard: {
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: 4,
    ...shadows.card,
  },
  langCard: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 6,
    ...shadows.card,
  },
  langBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnActive: { backgroundColor: colors.primary },
  langText: { fontSize: 13.5, fontWeight: '800', color: colors.textSoft },
  langTextActive: { color: colors.white },
  langHint: { fontSize: 11, color: colors.muted, marginTop: 6, marginBottom: 2, ...rtl },

  previewCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 14,
  },
  previewHead: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8 },
  previewTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, marginRight: 6 },
  previewText: {
    fontSize: 12.5,
    color: colors.text,
    lineHeight: 23,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewMeta: { fontSize: 10.5, color: colors.textSoft, marginTop: 10, ...rtl },

  saveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 52,
    marginTop: 18,
    ...shadows.card,
  },
  saveText: { color: colors.white, fontSize: 15.5, fontWeight: '800', marginRight: 8 },

  smsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    ...shadows.card,
  },
  smsHead: { flexDirection: 'row-reverse', alignItems: 'center' },
  smsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  smsTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },
  smsState: { fontSize: 11, color: colors.textSoft, marginTop: 3, ...rtl },
  smsHint: { fontSize: 11.5, color: colors.muted, lineHeight: 19, marginTop: 10, ...rtl },
  smsBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    borderRadius: radius.md,
    height: 44,
    marginTop: 12,
  },
  smsBtnOff: { backgroundColor: colors.redSoft },
  smsBtnText: { color: colors.white, fontSize: 13.5, fontWeight: '800', marginRight: 6 },
  smsPending: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 10,
  },
  smsPendingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginRight: 6,
    ...rtl,
  },

  premiumRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 13,
    marginTop: 14,
    ...shadows.card,
  },
  premiumIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  premiumTitle: { fontSize: 14, fontWeight: '800', color: colors.text, ...rtl },
  premiumSub: { fontSize: 11.5, color: colors.muted, marginTop: 3, ...rtl },

  dataCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 4,
    ...shadows.card,
  },
  dataRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  dataIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },
  dataTitle: { fontSize: 13.5, fontWeight: '800', ...rtl },
  dataSub: { fontSize: 10.5, color: colors.muted, marginTop: 3, lineHeight: 16, ...rtl },
  dataDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 13 },

  lockCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 13,
    marginTop: 14,
    ...shadows.card,
  },
  lockIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },
  lockTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },
  lockSub: { fontSize: 10.5, color: colors.muted, marginTop: 3, ...rtl },

  buildStamp: {
    fontSize: 10.5,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  footer: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 18,
    ...rtlCenter,
  },
});
