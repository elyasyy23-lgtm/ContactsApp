// Drawer (منوی کناری) — slides in from the RIGHT (RTL). Holds everything that
// used to clutter the home header: settings, categories, report, calculator,
// SMS imports — plus the clickable debtors card with the live count.
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, shadows } from '../theme';
import { money, toFa } from '../utils/format';
import { balanceOf, totalsOf, useContacts } from '../store/ContactsContext';
import { useSettings } from '../store/SettingsContext';
import { usePremium } from '../store/PremiumContext';
import { useSmsInbox } from '../store/SmsInboxContext';

const APP_VERSION = '۱٫۱';

function MenuItem({ icon, label, badge, tone = 'default', onPress }) {
  const palette =
    tone === 'red'
      ? { bg: colors.redSoft, fg: colors.red }
      : { bg: colors.primarySoft, fg: colors.primary };
  return (
    <TouchableOpacity activeOpacity={0.75} style={styles.item} onPress={onPress}>
      <View style={[styles.itemIcon, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={19} color={palette.fg} />
      </View>
      <Text style={[styles.itemLabel, tone === 'red' && { color: colors.redDark }]}>
        {label}
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{toFa(badge)}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-back" size={16} color={colors.muted} />
      )}
    </TouchableOpacity>
  );
}

export default function AppDrawer({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const { settings } = useSettings();
  const { premium, trialActive, trialDaysLeft } = usePremium();
  const { pending } = useSmsInbox();

  const stats = useMemo(() => {
    let debtors = 0;
    contacts.forEach((c) => {
      if (balanceOf(c) > 0) debtors += 1;
    });
    const { receivable } = totalsOf(contacts.filter((c) => balanceOf(c) > 0));
    return { debtors, receivable };
  }, [contacts]);

  // Every route lives inside the nested stack; target it explicitly.
  const go = (screen) => {
    navigation.navigate('MainStack', { screen });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.logo}>
          <Ionicons name="book" size={26} color={colors.white} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>eKhata</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {settings.shopName || 'دفتر حساب مشتریان'}
          </Text>
        </View>
      </LinearGradient>

      {/* Clickable debtors card — the live بدهکار count */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.debtorsCard}
        onPress={() => go('Debtors')}
      >
        <View style={styles.debtorsIcon}>
          <Ionicons name="people" size={20} color={colors.white} />
        </View>
        <View style={styles.debtorsText}>
          <Text style={styles.debtorsTitle}>بدهکاران</Text>
          <Text style={styles.debtorsSub} numberOfLines={1}>
            {stats.debtors > 0
              ? `${toFa(stats.debtors)} مشتری • جمع ${money(stats.receivable)} تومان`
              : 'همه تسویه هستند'}
          </Text>
        </View>
        {stats.debtors > 0 ? (
          <View style={styles.debtorsCount}>
            <Text style={styles.debtorsCountText}>{toFa(stats.debtors)}</Text>
          </View>
        ) : (
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.green} />
        )}
      </TouchableOpacity>

      {!premium ? (
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.trialRow}
          onPress={() => go('Premium')}
        >
          <Ionicons name="diamond-outline" size={15} color={colors.amber} />
          <Text style={styles.trialText}>
            {trialActive
              ? `دوره آزمایشی — ${toFa(trialDaysLeft)} روز باقی`
              : 'دوره آزمایشی پایان یافته'}
          </Text>
          <Text style={styles.trialAction}>جزئیات</Text>
        </TouchableOpacity>
      ) : null}

      <MenuItem icon="home-outline" label="صفحه اصلی" onPress={() => navigation.closeDrawer()} />
      <MenuItem icon="settings-outline" label="تنظیمات" onPress={() => go('Settings')} />
      <MenuItem icon="pricetags-outline" label="دسته‌های مشتری" onPress={() => go('Profiles')} />
      <MenuItem
        icon="document-text-outline"
        label="گزارش همه مشتریان"
        onPress={() => go('Report')}
      />
      <MenuItem
        icon="calculator-outline"
        label="ماشین حساب مالی"
        onPress={() => go('Calculator')}
      />
      <MenuItem
        icon="mail-unread-outline"
        label="پیامک‌های بانکی"
        badge={pending.length > 0 ? pending.length : null}
        onPress={() => go('SmsImport')}
      />

      <View style={styles.divider} />

      <Text style={styles.footer}>eKhata نسخه {APP_VERSION}</Text>
      <Text style={styles.footerSub}>
        اطلاعات فقط روی همین گوشی ذخیره می‌شود و به هیچ سروری ارسال نمی‌گردد.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 12 },

  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: 14,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginRight: 12 },
  title: { fontSize: 17, fontWeight: '800', color: colors.white, ...rtl },
  subtitle: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 3, ...rtl },

  debtorsCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 13,
    marginTop: 12,
    borderWidth: 1.4,
    borderColor: '#F7C7C7',
    ...shadows.card,
  },
  debtorsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtorsText: { flex: 1, marginRight: 10 },
  debtorsTitle: { fontSize: 14, fontWeight: '800', color: colors.text, ...rtl },
  debtorsSub: { fontSize: 10.5, color: colors.muted, marginTop: 3, ...rtl },
  debtorsCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  debtorsCountText: { fontSize: 12.5, fontWeight: '800', color: colors.redDark },

  trialRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
    marginBottom: 4,
  },
  trialText: { fontSize: 10.5, fontWeight: '800', color: '#8A6417', marginRight: 5 },
  trialAction: { fontSize: 10, fontWeight: '700', color: '#A5814A', marginRight: 8 },

  item: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, marginRight: 11, ...rtl },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: colors.white },

  divider: { height: 1, backgroundColor: colors.border, marginTop: 10, marginBottom: 10 },
  footer: { fontSize: 11, fontWeight: '700', color: colors.muted, ...rtl },
  footerSub: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 16,
    marginTop: 4,
    ...rtl,
  },
});
