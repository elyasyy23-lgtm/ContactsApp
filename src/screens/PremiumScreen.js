// Premium (نسخه ویژه) — 7-day free trial + one-time Myket / Cafe Bazaar purchase.
// Trial: full access for 7 days from the first launch, then the app is locked
// and only this screen stays reachable until the purchase is made.
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';
import { digits, money, toFa } from '../utils/format';
import { TRIAL_DAYS } from '../utils/trial';
import { usePremium } from '../store/PremiumContext';
import { ScreenHeader } from '../components/ui';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

const FEATURES = [
  { icon: 'people-outline', title: t('مشتری نامحدود'), text: t('بدون سقف مشتری؛ در دوره آزمایشی و بعد از خرید.') },
  { icon: 'notifications-outline', title: t('یادآوری خودکار پیامک'), text: t('برای بدهی بالای ۱٬۰۰۰٬۰۰۰ تومان، خودکار ارسال می‌شود.') },
  { icon: 'card-outline', title: t('اطلاعات کارت در پیام'), text: t('نام شما و شماره کارت داخل متن یادآوری درج می‌شود.') },
  { icon: 'cloud-download-outline', title: t('همه امکانات آینده'), text: t('یک‌بار خرید، استفاده همیشگی؛ به‌روزرسانی‌ها رایگان.') },
];

export default function PremiumScreen({ navigation }) {
  useLang(); // re-render when the app language changes
  const insets = useSafeAreaInsets();
  const {
    premium,
    busy,
    billingReady,
    trialActive,
    trialDaysLeft,
    locked,
    buy,
    restore,
    unlock,
    lock,
    debugShiftTrial,
  } = usePremium();

  const goBackOrHome = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Home');
  };

  const handleBuy = async () => {
    const result = await buy();
    if (result.ok) {
      Alert.alert(t('نسخه ویژه فعال شد'), t('از این پس می‌توانید بدون محدودیت از برنامه استفاده کنید.'));
      return;
    }
    if (result.reason === 'cancelled') return;
    Alert.alert(
      t('پرداخت در دسترس نیست'),
      t('این نسخه با Expo Go اجرا می‌شود و پرداخت درون‌برنامه‌ای مایکت فقط در نسخه نصبی (APK) فعال است. ') +
        t('برای دیدن بقیه برنامه، از دکمه «فعال‌سازی آزمایشی» استفاده کنید.'),
      [{ text: t('باشه') }],
    );
  };

  const handleRestore = async () => {
    const result = await restore();
    if (result.ok) {
      Alert.alert(t('بازیابی شد'), t('نسخه ویژه شما فعال شد.'));
      return;
    }
    Alert.alert(
      t('خرید قبلی پیدا نشد'),
      t('اگر قبلاً نسخه ویژه را خریداری کرده‌اید، ابتدا مطمئن شوید با همان حساب مایکت وارد شده‌اید.'),
      [{ text: t('باشه') }],
    );
  };

  const handleDemo = () => {
    Alert.alert(
      t('فعال‌سازی آزمایشی'),
      t('نسخه ویژه فقط روی این گوشی و برای تست فعال می‌شود. در نسخه نهایی مایکت، این دکمه با پرداخت واقعی جایگزین می‌شود.'),
      [
        { text: t('انصراف'), style: 'cancel' },
        {
          text: t('فعال کن'),
          onPress: () => unlock('demo'),
        },
      ],
    );
  };

  const subtitle = premium
    ? t('فعال است')
    : locked
      ? t('دوره آزمایشی پایان یافت')
      : t('{n} روز باقی مانده', { n: toFa(trialDaysLeft) });

  const heroTitle = premium
    ? t('نسخه ویژه فعال است')
    : locked
      ? t('دوره آزمایشی به پایان رسید')
      : t('{n} روز استفاده رایگان', { n: toFa(trialDaysLeft) });

  const heroSub = premium
    ? t('مشتری نامحدود و همه امکانات باز است.')
    : locked
      ? t('برای ثبت مشتری، ثبت تراکنش و ادامه کار، نسخه کامل را فعال کنید.')
      : t('همه امکانات برنامه تا {n} روز باز است. پس از پایان دوره، برای ادامه باید نسخه کامل را فعال کنید.', {
          n: toFa(TRIAL_DAYS),
        });

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('نسخه ویژه')}
        subtitle={subtitle}
        onBack={locked ? undefined : goBackOrHome}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroBadge}>
            <Ionicons name={locked ? 'lock-closed' : 'diamond'} size={16} color={colors.amber} />
            <Text style={styles.heroBadgeText}>{t('eKhata • نسخه ویژه')}</Text>
          </View>
          <Text style={styles.heroTitle}>{heroTitle}</Text>
          <Text style={styles.heroSub}>{heroSub}</Text>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>
              {premium ? '∞' : locked ? digits(0) : toFa(trialDaysLeft)}
            </Text>
            <Text style={styles.heroStatLabel}>
              {premium ? t('مشتری نامحدود') : t('روز باقی‌مانده')}
            </Text>
          </View>
        </LinearGradient>

        {locked ? (
          <View style={styles.lockedCard}>
            <Ionicons name="lock-closed" size={18} color={colors.redDark} />
            <Text style={styles.lockedText}>
              {t('برنامه قفل شده است. تا فعال‌سازی نسخه کامل، دسترسی به مشتریان و تراکنش‌ها ممکن نیست.')}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {FEATURES.map((feature, index) => (
            <View
              key={feature.icon}
              style={[styles.feature, index === FEATURES.length - 1 && styles.featureLast]}
            >
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={19} color={colors.green} />
            </View>
          ))}
        </View>

        {!premium ? (
          <>
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>{t('پرداخت یک‌باره')}</Text>
              <Text style={styles.priceValue}>
                {money(99000)} <Text style={styles.priceUnit}>{t('تومان')}</Text>
              </Text>
              <Text style={styles.priceHint}>
                {t('قیمت نهایی در صفحه پرداخت مایکت نمایش داده می‌شود.')}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.buyBtn, busy && { opacity: 0.6 }]}
              onPress={handleBuy}
              disabled={busy}
            >
              <Ionicons name="bag-check-outline" size={19} color={colors.white} />
              <Text style={styles.buyText}>
                {locked ? t('خرید نسخه کامل از مایکت') : t('خرید نسخه ویژه از مایکت')}
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleRestore} disabled={busy}>
                <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                <Text style={styles.secondaryText}>{t('بازیابی خرید')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleDemo}>
                <Ionicons name="flask-outline" size={15} color={colors.textSoft} />
                <Text style={[styles.secondaryText, { color: colors.textSoft }]}>
                  {t('فعال‌سازی آزمایشی')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.note}>
              {trialActive
                ? t('دوره آزمایشی {n} روزه از اولین اجرای برنامه شروع می‌شود و با حذف و نصب دوباره بازنشانی نمی‌شود.', { n: toFa(TRIAL_DAYS) })
                : t('دوره آزمایشی {n} روزه شما به پایان رسیده است. خرید نسخه کامل، دسترسی را برای همیشه برمی‌گرداند.', { n: toFa(TRIAL_DAYS) })}
            </Text>

            <Text style={styles.note}>
              {billingReady
                ? t('پرداخت از طریق مایکت انجام می‌شود؛ در صورت بروز مشکل با پشتیبانی مایکت تماس بگیرید.')
                : t('پرداخت درون‌برنامه‌ای مایکت پس از نصب نسخه APK فعال می‌شود. این صفحه فعلاً برای آزمایش جریان خرید است.')}
            </Text>

            {__DEV__ ? (
              <TouchableOpacity style={styles.resetBtn} onPress={() => debugShiftTrial(8)}>
                <Text style={styles.resetText}>
                  {locked ? t('بازنشانی دوره آزمایشی (تست)') : t('پایان دوره آزمایشی (تست)')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.activeCard}>
              <View style={styles.activeIcon}>
                <Ionicons name="checkmark" size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>{t('نسخه ویژه فعال است')}</Text>
                <Text style={styles.activeText}>
                  {t('می‌توانید بدون محدودیت مشتری اضافه کنید.')}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.continueBtn}
              onPress={goBackOrHome}
            >
              <Text style={styles.continueText}>{t('بازگشت به برنامه')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetBtn} onPress={lock}>
              <Text style={styles.resetText}>{t('غیرفعال‌سازی (فقط برای تست)')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },

  hero: {
    borderRadius: radius.xl,
    padding: 18,
    alignItems: 'center',
    ...shadows.hero,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroBadgeText: { color: colors.white, fontSize: 10.5, fontWeight: '800', marginLeft: 6, letterSpacing: 0.6 },
  heroTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    marginTop: 12,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 8,
    lineHeight: 20,
    ...rtlCenter,
  },
  heroStat: { alignItems: 'center', marginTop: 14 },
  heroStatValue: { fontSize: 26, fontWeight: '800', color: colors.white },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2, ...rtlCenter },

  lockedCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.redSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
  },
  lockedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.redDark,
    lineHeight: 20,
    marginRight: 10,
    ...rtl,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 8,
    marginTop: 14,
    ...shadows.card,
  },
  feature: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  featureLast: { borderBottomWidth: 0 },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  featureTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },
  featureText: { fontSize: 11.5, color: colors.muted, marginTop: 3, lineHeight: 18, ...rtl },

  priceCard: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
    alignItems: 'center',
  },
  priceLabel: { fontSize: 11.5, color: '#8A6417', fontWeight: '700', ...rtlCenter },
  priceValue: { fontSize: 24, fontWeight: '800', color: '#8A6417', marginTop: 6 },
  priceUnit: { fontSize: 13, fontWeight: '700' },
  priceHint: { fontSize: 10.5, color: '#A5814A', marginTop: 6, ...rtlCenter },

  buyBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 54,
    marginTop: 14,
    ...shadows.float,
  },
  buyText: { color: colors.white, fontSize: 15.5, fontWeight: '800', marginRight: 8 },

  secondaryRow: { flexDirection: 'row-reverse', marginTop: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { fontSize: 11.5, fontWeight: '800', color: colors.primary, marginRight: 5 },

  note: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 19,
    marginTop: 14,
    paddingHorizontal: 6,
    ...rtl,
  },

  activeCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
  },
  activeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  activeTitle: { fontSize: 14, fontWeight: '800', color: colors.greenDark, ...rtl },
  activeText: { fontSize: 11.5, color: '#2F7A58', marginTop: 3, ...rtl },

  continueBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 52,
    marginTop: 14,
    ...shadows.card,
  },
  continueText: { color: colors.white, fontSize: 15.5, fontWeight: '800' },
  resetBtn: { alignItems: 'center', paddingVertical: 14 },
  resetText: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
});
