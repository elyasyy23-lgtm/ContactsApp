// Premium (نسخه ویژه) — paywall for the Myket / Cafe Bazaar in-app purchase.
// Free plan: up to 10 customers. Premium: unlimited + all future features.
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';
import { money, toFa } from '../utils/format';
import { usePremium } from '../store/PremiumContext';
import { useContacts } from '../store/ContactsContext';
import { ScreenHeader } from '../components/ui';

const FEATURES = [
  { icon: 'people-outline', title: 'مشتری نامحدود', text: 'نسخه رایگان تا ۱۰ مشتری اجازه می‌دهد.' },
  { icon: 'notifications-outline', title: 'یادآوری خودکار پیامک', text: 'برای بدهی بالای ۱٬۰۰۰٬۰۰۰ تومان، خودکار ارسال می‌شود.' },
  { icon: 'card-outline', title: 'اطلاعات کارت در پیام', text: 'نام شما و شماره کارت داخل متن یادآوری درج می‌شود.' },
  { icon: 'cloud-download-outline', title: 'همه امکانات آینده', text: 'یک‌بار خرید، استفاده همیشگی؛ به‌روزرسانی‌ها رایگان.' },
];

export default function PremiumScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { premium, busy, billingReady, buy, restore, unlock, lock, freeLimit } = usePremium();
  const { contacts } = useContacts();

  const handleBuy = async () => {
    const result = await buy();
    if (result.ok) {
      Alert.alert('نسخه ویژه فعال شد', 'از این پس می‌توانید مشتری نامحدود اضافه کنید.');
      return;
    }
    if (result.reason === 'cancelled') return;
    Alert.alert(
      'پرداخت در دسترس نیست',
      'این نسخه با Expo Go اجرا می‌شود و پرداخت درون‌برنامه‌ای مایکت فقط در نسخه نصبی (APK) فعال است. ' +
        'برای دیدن بقیه برنامه، از دکمه «فعال‌سازی آزمایشی» استفاده کنید.',
      [{ text: 'باشه' }],
    );
  };

  const handleRestore = async () => {
    const result = await restore();
    if (result.ok) {
      Alert.alert('بازیابی شد', 'نسخه ویژه شما فعال شد.');
      return;
    }
    Alert.alert(
      'خرید قبلی پیدا نشد',
      'اگر قبلاً نسخه ویژه را خریداری کرده‌اید، ابتدا مطمئن شوید با همان حساب مایکت وارد شده‌اید.',
      [{ text: 'باشه' }],
    );
  };

  const handleDemo = () => {
    Alert.alert(
      'فعال‌سازی آزمایشی',
      'نسخه ویژه فقط روی این گوشی و برای تست فعال می‌شود. در نسخه نهایی مایکت، این دکمه با پرداخت واقعی جایگزین می‌شود.',
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'فعال کن',
          onPress: () => unlock('demo'),
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="نسخه ویژه"
        subtitle={premium ? 'فعال است' : 'مشتری نامحدود'}
        onBack={() => navigation.goBack()}
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
            <Ionicons name="diamond" size={16} color={colors.amber} />
            <Text style={styles.heroBadgeText}>eKhata • نسخه ویژه</Text>
          </View>
          <Text style={styles.heroTitle}>
            {premium ? 'نسخه ویژه فعال است' : 'حساب مشتریان، بدون محدودیت'}
          </Text>
          <Text style={styles.heroSub}>
            {premium
              ? 'مشتری نامحدود و همه امکانات باز است.'
              : `نسخه رایگان تا ${toFa(freeLimit)} مشتری؛ با یک خرید، محدودیت برای همیشه برداشته می‌شود.`}
          </Text>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>
              {premium ? '∞' : `${toFa(contacts.length)} / ${toFa(freeLimit)}`}
            </Text>
            <Text style={styles.heroStatLabel}>مشتری ثبت‌شده</Text>
          </View>
        </LinearGradient>

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
              <Text style={styles.priceLabel}>پرداخت یک‌باره</Text>
              <Text style={styles.priceValue}>
                {money(99000)} <Text style={styles.priceUnit}>تومان</Text>
              </Text>
              <Text style={styles.priceHint}>
                قیمت نهایی در صفحه پرداخت مایکت نمایش داده می‌شود.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.buyBtn, busy && { opacity: 0.6 }]}
              onPress={handleBuy}
              disabled={busy}
            >
              <Ionicons name="bag-check-outline" size={19} color={colors.white} />
              <Text style={styles.buyText}>خرید نسخه ویژه از مایکت</Text>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleRestore} disabled={busy}>
                <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                <Text style={styles.secondaryText}>بازیابی خرید</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleDemo}>
                <Ionicons name="flask-outline" size={15} color={colors.textSoft} />
                <Text style={[styles.secondaryText, { color: colors.textSoft }]}>
                  فعال‌سازی آزمایشی
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.note}>
              {billingReady
                ? 'پرداخت از طریق مایکت انجام می‌شود؛ در صورت بروز مشکل با پشتیبانی مایکت تماس بگیرید.'
                : 'پرداخت درون‌برنامه‌ای مایکت پس از نصب نسخه APK فعال می‌شود. این صفحه فعلاً برای آزمایش جریان خرید است.'}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.activeCard}>
              <View style={styles.activeIcon}>
                <Ionicons name="checkmark" size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>نسخه ویژه فعال است</Text>
                <Text style={styles.activeText}>
                  می‌توانید بدون محدودیت مشتری اضافه کنید.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.continueBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.continueText}>بازگشت به برنامه</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetBtn} onPress={lock}>
              <Text style={styles.resetText}>غیرفعال‌سازی (فقط برای تست)</Text>
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
