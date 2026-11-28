// Shop settings: my name, card number, shop name.
// These values feed the reminder SMS (card + owner name) and the home header.
import React, { useEffect, useMemo, useState } from 'react';
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
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';
import { groupCard, money, toFa } from '../utils/format';
import { buildReminder } from '../utils/smsParser';
import { silentSmsAvailable } from '../utils/smsSend';
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
import {
  buildGuestArchiveUrl,
  maskRtspUrl,
} from '../utils/rtsp';
import { triggerTVPlayback } from '../utils/tvPlayback';
import { CCTV_LOG_SECTIONS } from '../utils/diagnostics';
import { normalizeWeeklySchedule } from '../utils/weeklyReminder';
import { useCctvDiagnosticsActions } from '../store/DiagnosticsContext';
import { LANGUAGES, t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

function Field({ label, icon, hint, inputStyle, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={17} color={colors.muted} />
        <TextInput
          style={[styles.input, inputStyle]}
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
  const { logInfo, logWarning, logError } = useCctvDiagnosticsActions();
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
  const [newSender, setNewSender] = useState('');
  // Weekly schedule state. Mirrors the persisted settings and is re-synced below;
  // 0 (Sunday / hour 00) is a VALID value, so never fall back with `||`.
  const initialWeeklySchedule = normalizeWeeklySchedule(settings);
  const [weeklyWeekday, setWeeklyWeekday] = useState(initialWeeklySchedule.weekday);
  const [weeklyHour, setWeeklyHour] = useState(initialWeeklySchedule.hour);
  const [weeklyMinute, setWeeklyMinute] = useState(initialWeeklySchedule.minute);

  // Re-sync whenever the persisted settings change (async hydration on launch,
  // an external save, a restore). Without this the screen kept the first-render
  // defaults and the next Save wrote Friday 10:00 back over the chosen day.
  useEffect(() => {
    const synced = normalizeWeeklySchedule(settings);
    setWeeklyWeekday(synced.weekday);
    setWeeklyHour(synced.hour);
    setWeeklyMinute(synced.minute);
  }, [settings.weeklyWeekday, settings.weeklyHour, settings.weeklyMinute]);
  const [dvrIp, setDvrIp] = useState(settings.dvrIp || '');
  const [dvrPort, setDvrPort] = useState(settings.dvrPort || '34567');
  const [rtspPort, setRtspPort] = useState(settings.rtspPort || '554');
  const [dvrChannel, setDvrChannel] = useState(Number(settings.dvrChannel) || 1);
  const [dvrUser, setDvrUser] = useState(settings.dvrUser || 'admin');
  const [dvrPassword, setDvrPassword] = useState(settings.dvrPassword || '');
  const [dvrSerial, setDvrSerial] = useState(settings.dvrSerial || '292c3e41a34907d9');
  const [dvrTesting, setDvrTesting] = useState(false);

  const excludedSenders = settings.excludedSmsSenders || [];

  const addExcludedSender = () => {
    const num = newSender.replace(/\D/g, '');
    if (num.length < 3) {
      Alert.alert(t('شماره نامعتبر'), t('یک شماره تلفن یا کد فرستندهٔ معتبر وارد کنید.'));
      return;
    }
    if (excludedSenders.includes(num)) {
      Alert.alert(t('تکراری'), t('این شماره قبلاً در فهرست نادیده‌گرفته‌شده‌ها هست.'));
      return;
    }
    saveSettings({ excludedSmsSenders: [...excludedSenders, num] });
    setNewSender('');
  };

  const removeExcludedSender = (num) => {
    saveSettings({ excludedSmsSenders: excludedSenders.filter((s) => s !== num) });
  };

  const dvrIpValue = String(dvrIp || '').trim();
  const dvrPortValue = String(dvrPort || '').replace(/\D/g, '');
  const dvrPortValid =
    dvrPortValue.length > 0 &&
    Number(dvrPortValue) > 0 &&
    Number(dvrPortValue) <= 65535;
  const rtspPortValue = String(rtspPort || '').replace(/\D/g, '');
  const rtspPortValid =
    rtspPortValue.length > 0 &&
    Number(rtspPortValue) > 0 &&
    Number(rtspPortValue) <= 65535;
  const dvrIpValid = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(dvrIpValue)
    && dvrIpValue.split('.').every((part) => Number(part) <= 255);

  const dvrValues = () => ({
    ip: dvrIpValue,
    port: dvrPortValue,
    rtspPort: rtspPortValue,
    channel: Number(dvrChannel) || 1,
    user: String(dvrUser || ''),
    pass: String(dvrPassword || ''),
    serial: String(dvrSerial || '').trim(),
  });

  const testDvrPlayback = async () => {
    if (!dvrIpValid) {
      Alert.alert(
        t('آدرس DVR نامعتبر'),
        t('آدرس IP معتبر وارد کنید (مثلاً 192.168.1.64).'),
      );
      logError(
        CCTV_LOG_SECTIONS.SETTINGS,
        'تنظیمات DVR نامعتبر است',
        'آدرس IP دوربین معتبر نیست.',
      );
      return;
    }
    if (!dvrPortValid || !rtspPortValid) {
      Alert.alert(
        t('پورت نامعتبر'),
        t('هر دو پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشند.'),
      );
      logError(
        CCTV_LOG_SECTIONS.SETTINGS,
        'پورت DVR نامعتبر است',
        'پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد.',
      );
      return;
    }

    const values = dvrValues();
    const timestamp = Date.now();
    // Password-free guest URL (owner rule): the test must verify the same
    // credential-free archive path the app actually uses.
    const rtspUrl = buildGuestArchiveUrl({
      ip: values.ip,
      port: values.rtspPort,
      channel: values.channel,
      timestamp,
      leadMinutes: 5,
      durationMinutes: 10,
    });
    if (!rtspUrl) {
      Alert.alert(t('لینک RTSP ساخته نشد'), t('زمان تراکنش یا تنظیمات DVR معتبر نیست.'));
      logError(
        CCTV_LOG_SECTIONS.SETTINGS,
        'ساخت آدرس آرشیو دوربین ممکن نشد',
        'زمان تراکنش یا تنظیمات DVR معتبر نیست.',
      );
      return;
    }

    saveSettings({
      dvrIp: values.ip,
      dvrPort: values.port,
      rtspPort: values.rtspPort,
      dvrChannel: values.channel,
      dvrUser: values.user,
      dvrPassword: values.pass,
      dvrSerial: values.serial,
    });

    setDvrTesting(true);
    logInfo(
      CCTV_LOG_SECTIONS.CCTV,
      'آزمایش اتصال به دوربین آغاز شد',
      'درخواست آزمایشی پخش آرشیو ارسال می‌شود.',
    );
    try {
      const result = await triggerTVPlayback({
        ip: values.ip,
        port: values.port,
        timestamp,
        channel: values.channel,
        rtspPort: values.rtspPort,
      });
      if (result.ok) {
        Alert.alert(t('پخش آزمایشی ارسال شد'), t('دستور پخش ارسال شد.'));
        logInfo(
          CCTV_LOG_SECTIONS.CCTV,
          'اتصال به دوربین برقرار شد',
          `پاسخ دوربین: HTTP ${result.status || 200}`,
        );
        return;
      }
      if (result.reason === 'not-configured') {
        Alert.alert(
          t('پخش روی تلویزیون تنظیم نشده است'),
          t('آدرس CGI پخش تلویزیون هنوز تنظیم نشده است. لینک RTSP: {url}', {
            url: maskRtspUrl(rtspUrl),
          }),
        );
        logWarning(
          CCTV_LOG_SECTIONS.CCTV,
          'پخش روی تلویزیون تنظیم نشده است',
          'آدرس CGI پخش تلویزیون خالی است.',
        );
        return;
      }
      Alert.alert(
        t('پخش آزمایشی ناموفق'),
        t('دستور پخش ارسال نشد ({reason}).', {
          reason: result.reason || 'network',
        }),
      );
      logError(
        CCTV_LOG_SECTIONS.CCTV,
        'اتصال به دوربین برقرار نشد',
        result.reason === 'http'
          ? `پاسخ نامعتبر از دوربین: HTTP ${result.status || 0}`
          : 'خطای شبکه در تماس با دوربین.',
      );
    } finally {
      setDvrTesting(false);
    }
  };

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

  // 0=Sunday … 6=Saturday (same order the chips and weeklyReminder.js use).
  const WEEKDAY_LABELS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'].map(
    (day) => t(day),
  );
  const weeklyDayLabel = WEEKDAY_LABELS[weeklyWeekday] || WEEKDAY_LABELS[5];
  const weeklyTimeLabel = `${String(weeklyHour).padStart(2, '0')}:${String(weeklyMinute).padStart(2, '0')}`;

  const weeklySmsState = settings.weeklySmsEnabled
    ? t('فعال — هر {day} ساعت {time} ارسال میشود', {
        day: weeklyDayLabel,
        time: weeklyTimeLabel,
      }) + (silentSmsAvailable ? '' : ' ' + t('(نیاز به APK برای ارسال)'))
    : t('غیرفعال — در صورت تمایل روشن کنید');

  // Persist the schedule the moment it is chosen: selecting a day or a time
  // must survive leaving the screen (the old code only saved it when the big
  // Save button happened to be pressed).
  const applyWeeklySchedule = (patch) => {
    const next = normalizeWeeklySchedule({
      weekday: weeklyWeekday,
      hour: weeklyHour,
      minute: weeklyMinute,
      ...patch,
    });
    setWeeklyWeekday(next.weekday);
    setWeeklyHour(next.hour);
    setWeeklyMinute(next.minute);
    saveSettings({
      weeklyWeekday: next.weekday,
      weeklyHour: next.hour,
      weeklyMinute: next.minute,
    });
  };

  // Classic clock dial (Android Material time picker) in 24-hour mode.
  const openTimePicker = () => {
    const initial = new Date();
    initial.setHours(weeklyHour, weeklyMinute, 0, 0);
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'time',
      is24Hour: true,
      display: 'clock',
      onChange: (event, date) => {
        if (event?.type !== 'set' || !date) return;
        applyWeeklySchedule({ hour: date.getHours(), minute: date.getMinutes() });
      },
    });
  };

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
    // Never let a native-module problem crash the Settings screen: if the
    // biometric API cannot answer, treat it as "not available" and say so.
    let hasHardware = false;
    let enrolled = false;
    try {
      hasHardware = await LocalAuthentication.hasHardwareAsync();
      enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    } catch {
      hasHardware = false;
      enrolled = false;
    }
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
    if (!dvrIpValid) {
      Alert.alert(t('آدرس DVR نامعتبر'), t('آدرس IP معتبر وارد کنید (مثلاً 192.168.1.64).'));
      logError(
        CCTV_LOG_SECTIONS.SETTINGS,
        'ذخیرهٔ تنظیمات DVR انجام نشد',
        'آدرس IP دوربین معتبر نیست.',
      );
      return;
    }
    if (!dvrPortValid) {
      Alert.alert(t('پورت نامعتبر'), t('پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد.'));
      logError(
        CCTV_LOG_SECTIONS.SETTINGS,
        'ذخیرهٔ تنظیمات DVR انجام نشد',
        'پورت دوربین معتبر نیست.',
      );
      return;
    }
    saveSettings({
      myName: myName.trim(),
      cardNumber: digits,
      shopName: shopName.trim(),
      weeklyWeekday: weeklyWeekday,
      weeklyHour: weeklyHour,
      weeklyMinute: weeklyMinute,
      dvrIp: dvrIpValue,
      dvrPort: dvrPortValue,
      rtspPort: rtspPortValue,
      dvrChannel: Number(dvrChannel) || 1,
      dvrUser: String(dvrUser || ''),
      dvrPassword: String(dvrPassword || ''),
      dvrSerial: String(dvrSerial || '').trim(),
    });
    logInfo(
      CCTV_LOG_SECTIONS.SETTINGS,
      'تنظیمات دوربین ذخیره شد',
      'آدرس، پورت و مشخصات دوربین در حافظهٔ محلی ذخیره شد.',
    );
    Alert.alert(t('ذخیره شد'), t('اطلاعات فروشگاه و دوربین با موفقیت ذخیره شد.'), [
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

          <Text style={styles.sectionTitle}>{t('پخش فیلم دوربین')}</Text>
          <View style={styles.card}>
            <Field
              label={t('آدرس IP دوربین')}
              icon="wifi-outline"
              value={dvrIp}
              onChangeText={setDvrIp}
              placeholder="192.168.1.64"
              keyboardType="number-pad"
              inputStyle={styles.asciiInput}
              hint={t('آدرس محلی DVR را وارد کنید.')}
            />
            <Field
              label={t('پورت DVR')}
              icon="server-outline"
              value={dvrPort}
              onChangeText={setDvrPort}
              placeholder="34567"
              keyboardType="number-pad"
              maxLength={5}
              inputStyle={styles.asciiInput}
              hint={t('پورت کنترل DVRIP؛ پیش‌فرض ۳۴۵۶۷ است.')}
            />
            <Field
              label={t('پورت RTSP')}
              icon="videocam-outline"
              value={rtspPort}
              onChangeText={setRtspPort}
              placeholder="554"
              keyboardType="number-pad"
              maxLength={5}
              inputStyle={styles.asciiInput}
              hint={t('پورت پخش تصویر؛ پیش‌فرض ۵۵۴ است.')}
            />
            <View style={styles.channelBlock}>
              <Text style={styles.channelLabel}>{t('کانال دوربین')}</Text>
              <View style={styles.channelRow}>
                {[1, 2, 3, 4].map((item) => (
                  <TouchableOpacity
                    key={item}
                    activeOpacity={0.85}
                    style={[styles.channelBtn, Number(dvrChannel) === item && styles.channelBtnActive]}
                    onPress={() => setDvrChannel(item)}
                  >
                    <Text
                      style={[
                        styles.channelText,
                        Number(dvrChannel) === item && styles.channelTextActive,
                      ]}
                    >
                      {t('کانال {n}', { n: item })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.channelHint}>{t('کانال‌های ۱ تا ۴ فعال هستند.')}</Text>
            </View>
            <Field
              label={t('نام کاربری DVR')}
              icon="person-outline"
              value={dvrUser}
              onChangeText={setDvrUser}
              placeholder="admin"
              autoCapitalize="none"
              inputStyle={styles.asciiInput}
            />
            <Field
              label={t('رمز عبور DVR')}
              icon="lock-closed-outline"
              value={dvrPassword}
              onChangeText={setDvrPassword}
              placeholder={t('رمز دستگاه')}
              secureTextEntry
              autoCapitalize="none"
              inputStyle={styles.asciiInput}
            />
            <Field
              label={t('شماره سریال دستگاه')}
              icon="barcode-outline"
              value={dvrSerial}
              onChangeText={setDvrSerial}
              placeholder="292c3e41a34907d9"
              autoCapitalize="none"
              inputStyle={styles.asciiInput}
              hint={t('برای شناسایی دستگاه در تنظیمات استفاده می‌شود.')}
            />

            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.smsBtn, styles.dvrTestBtn]}
              onPress={testDvrPlayback}
              disabled={dvrTesting}
            >
              <Ionicons name="play-outline" size={17} color={colors.white} />
              <Text style={styles.smsBtnText}>{t('Test TV Playback')}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              {t('پخش آرشیو ۵ دقیقه پیش از زمان تراکنش آغاز می‌شود.')}
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.88} style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
            <Text style={styles.saveText}>{t('ذخیره تنظیمات')}</Text>
          </TouchableOpacity>

          <View style={styles.weeklyCard}>
            <View style={styles.weeklyHead}>
              <View
                style={[
                  styles.weeklyIcon,
                  {
                    backgroundColor: settings.weeklySmsEnabled
                      ? colors.greenSoft
                      : colors.amberSoft,
                  },
                ]}
              >
                <Ionicons
                  name={settings.weeklySmsEnabled ? 'calendar-outline' : 'calendar-clear-outline'}
                  size={17}
                  color={settings.weeklySmsEnabled ? colors.green : colors.amber}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.weeklyTitle}>{t('یادآوری هفتگی بدهی')}</Text>
                <Text style={styles.weeklyState}>{weeklySmsState}</Text>
              </View>
              <Switch
                accessibilityLabel={t('یادآوری هفتگی بدهی')}
                value={settings.weeklySmsEnabled}
                onValueChange={(value) => {
                  saveSettings({ weeklySmsEnabled: value });
                }}
                trackColor={{ false: colors.border, true: colors.greenSoft }}
                thumbColor={settings.weeklySmsEnabled ? colors.green : colors.white}
                ios_backgroundColor={colors.border}
              />
            </View>
            {settings.weeklySmsEnabled && (
              <View style={styles.weeklySchedule}>
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{t('روز هفته')}</Text>
                  <View style={styles.weekdayRow}>
                    {WEEKDAY_LABELS.map((day, index) => (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.85}
                        style={[
                          styles.weekdayBtn,
                          weeklyWeekday === index && styles.weekdayBtnActive,
                        ]}
                        onPress={() => applyWeeklySchedule({ weekday: index })}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            weeklyWeekday === index && styles.weekdayTextActive,
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{t('زمان ارسال')}</Text>
                  <View style={styles.timeRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.timePickerBtn}
                      onPress={openTimePicker}
                      accessibilityRole="button"
                      accessibilityLabel={t('انتخاب زمان ارسال')}
                    >
                      <Ionicons name="time-outline" size={18} color={colors.primary} />
                      <Text style={styles.timePickerValue}>{weeklyTimeLabel}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            <Text style={styles.weeklyHint}>
              {t('برای بدهی بالای ۱٬۰۰۰٬۰۰۰ تومان، هر {day} ساعت {time} یک پیامک خودکار ارسال میشود. این قابلیت فقط در نسخه APK موجود است و هر مشتری در هفته یک بار پیامک میگیرد.', {
                  day: weeklyDayLabel,
                  time: weeklyTimeLabel,
                })}
            </Text>
          </View>

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

            <View style={styles.excludeBlock}>
              <View style={styles.excludeHead}>
                <Ionicons name="ban-outline" size={15} color={colors.muted} />
                <Text style={styles.excludeTitle}>{t('نادیده‌گرفتن شماره‌ها')}</Text>
              </View>
              <Text style={styles.excludeHint}>
                {t('پیامک‌هایی که از این شماره‌ها بیایند به‌کلی نادیده گرفته می‌شوند: نه ثبت خودکار، نه فهرست انتظار. برای بقیهٔ شماره‌ها همه‌چیز عادی است.')}
              </Text>

              {excludedSenders.length > 0 ? (
                <View style={styles.excludeList}>
                  {excludedSenders.map((num) => (
                    <View key={num} style={styles.excludeChip}>
                      <Text style={styles.excludeChipText}>{toFa(num)}</Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => removeExcludedSender(num)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={17} color={colors.red} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.excludeAddRow}>
                <TextInput
                  style={styles.excludeInput}
                  value={newSender}
                  onChangeText={setNewSender}
                  placeholder={t('مثلاً 09123456789')}
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  textAlign="right"
                  onSubmitEditing={addExcludedSender}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.excludeAddBtn}
                  onPress={addExcludedSender}
                >
                  <Ionicons name="add" size={18} color={colors.white} />
                  <Text style={styles.excludeAddText}>{t('افزودن')}</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  asciiInput: { writingDirection: 'ltr', textAlign: 'right' },

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
  channelBlock: { marginTop: 4, marginBottom: 6 },
  channelLabel: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 8, ...rtl },
  channelRow: { flexDirection: 'row-reverse' },
  channelBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  channelBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  channelText: { fontSize: 12, fontWeight: '700', color: colors.textSoft },
  channelTextActive: { color: colors.white },
  channelHint: { fontSize: 10.5, color: colors.muted, marginTop: 6, ...rtl },

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

  weeklyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 18,
    ...shadows.card,
  },
  weeklyHead: { flexDirection: 'row-reverse', alignItems: 'center' },
  weeklyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  weeklyTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },
  weeklyState: { fontSize: 11, color: colors.textSoft, marginTop: 3, ...rtl },
  weeklyHint: { fontSize: 11.5, color: colors.muted, lineHeight: 19, marginTop: 10, ...rtl },

  weeklySchedule: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scheduleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 10,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 10,
    minWidth: 70,
    ...rtl,
  },
  weekdayRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  weekdayBtn: {
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginLeft: 4,
    marginTop: 4,
    minWidth: 56,
  },
  weekdayBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textSoft,
  },
  weekdayTextActive: {
    color: colors.white,
  },
  timeRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  timeBtn: {
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginLeft: 4,
    minWidth: 56,
  },
  timeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textSoft,
  },
  timeTextActive: {
    color: colors.white,
  },
  timePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    ...shadows.card,
  },
  timePickerValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginLeft: 8,
    letterSpacing: 1,
    writingDirection: 'ltr',
    fontFamily: 'sans-serif-monospace',
  },

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
  dvrTestBtn: { backgroundColor: colors.primary },
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
  excludeBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  excludeHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  excludeTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.text,
    marginRight: 6,
    ...rtl,
  },
  excludeHint: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 6,
    ...rtl,
  },
  excludeList: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  excludeChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginLeft: 8,
    marginTop: 8,
  },
  excludeChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 6,
    writingDirection: 'ltr',
  },
  excludeAddRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 10,
  },
  excludeInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: colors.text,
    backgroundColor: colors.card,
    writingDirection: 'ltr',
  },
  excludeAddBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    borderRadius: radius.md,
    height: 42,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  excludeAddText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
    marginRight: 4,
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
