import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, faText, radius, rtl, rtlCenter, shadows, REMINDER_THRESHOLD } from '../theme';
import { money, toFa } from '../utils/format';
import { balanceOf, sortContacts, useContacts } from '../store/ContactsContext';
import { useSettings } from '../store/SettingsContext';
import { usePremium } from '../store/PremiumContext';
import { useSmsInbox } from '../store/SmsInboxContext';
import { Avatar, Chip, EmptyState } from '../components/ui';

const ALL = '__all__';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contacts, deleteContact } = useContacts();
  const { settings } = useSettings();
  const { premium, freeLimit, isLimitReached, remaining } = usePremium();
  const { pending, recentAuto, clearRecentAuto } = useSmsInbox();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState(ALL);

  const sorted = useMemo(() => sortContacts(contacts), [contacts]);

  const letters = useMemo(() => {
    const seen = [];
    sorted.forEach((c) => {
      if (c.letter && !seen.includes(c.letter)) seen.push(c.letter);
    });
    return [ALL, ...seen];
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((c) => {
      const matchesLetter = letter === ALL || c.letter === letter;
      const matchesQuery =
        !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
      return matchesLetter && matchesQuery;
    });
  }, [sorted, letter, query]);

  const totals = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    let debtors = 0;
    let urgent = 0;
    contacts.forEach((c) => {
      const b = balanceOf(c);
      if (b > 0) {
        receivable += b;
        debtors += 1;
        if (b > REMINDER_THRESHOLD) urgent += 1;
      } else if (b < 0) {
        payable += Math.abs(b);
      }
    });
    return { receivable, payable, debtors, urgent };
  }, [contacts]);

  const confirmDelete = (item) => {
    Alert.alert('حذف مشتری', `«${item.name}» با تمام تراکنش‌هایش حذف شود؟`, [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => deleteContact(item.id),
      },
    ]);
  };

  const openDetail = (item) =>
    navigation.navigate('CustomerDetail', { contactId: item.id });

  const addCustomer = () => {
    if (isLimitReached(contacts.length)) {
      Alert.alert(
        'محدودیت نسخه رایگان',
        `در نسخه رایگان حداکثر ${toFa(freeLimit)} مشتری می‌توانید ثبت کنید. برای افزودن مشتری نامحدود، نسخه ویژه را فعال کنید.`,
        [
          { text: 'بعداً', style: 'cancel' },
          { text: 'نسخه ویژه', onPress: () => navigation.navigate('Premium') },
        ],
      );
      return;
    }
    navigation.navigate('CustomerForm', {});
  };

  const renderItem = ({ item }) => {
    const balance = balanceOf(item);
    const needsReminder = balance > REMINDER_THRESHOLD;
    const amountColor =
      balance > 0 ? colors.red : balance < 0 ? colors.green : colors.muted;
    const amountLabel =
      balance > 0 ? 'بدهکار' : balance < 0 ? 'بستانکار' : 'تسویه';

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.card, needsReminder && styles.cardUrgent]}
        onPress={() => openDetail(item)}
        onLongPress={() => confirmDelete(item)}
        delayLongPress={450}
      >
        <Avatar letter={item.letter} tone={needsReminder ? 'red' : 'purple'} />

        <View style={styles.cardMain}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, faText]} numberOfLines={1}>
              {item.name}
            </Text>
            {needsReminder ? (
              <View style={styles.bell}>
                <Ionicons name="notifications" size={11} color={colors.white} />
              </View>
            ) : null}
          </View>
          <Text style={[styles.phone, rtl]} numberOfLines={1}>
            {item.phone ? toFa(item.phone) : 'بدون شماره تلفن'}
          </Text>
        </View>

        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
            {balance === 0 ? '۰' : money(balance)}
          </Text>
          <Text style={[styles.amountLabel, { color: amountColor }]}>{amountLabel}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.heroTop}>
          <TouchableOpacity
            style={styles.heroIcon}
            activeOpacity={0.75}
            onPress={() => navigation.navigate('SmsImport')}
          >
            <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.white} />
          </TouchableOpacity>

          <View style={styles.heroCenter}>
            <Text style={styles.heroTitle}>eKhata</Text>
            <Text style={styles.heroSub} numberOfLines={1}>
              {settings.shopName || 'دفتر حساب مشتریان'}
            </Text>
          </View>

          <View style={styles.heroRight}>
            <TouchableOpacity
              style={styles.heroIcon}
              activeOpacity={0.75}
              onPress={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setQuery('');
              }}
            >
              <Ionicons
                name={searchOpen ? 'close' : 'search'}
                size={20}
                color={colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.heroIcon, styles.heroIconSpaced]}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('Settings')}
            >
              <Ionicons name="settings-outline" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {searchOpen ? (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="جستجوی نام یا شماره…"
              placeholderTextColor={colors.muted}
              autoFocus
            />
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.summaryWrap}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>طلب از مشتریان</Text>
              <Text style={[styles.summaryValue, { color: colors.red }]}>
                {money(totals.receivable)}
              </Text>
              <Text style={styles.summaryUnit}>تومان</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>بدهی به مشتریان</Text>
              <Text style={[styles.summaryValue, { color: colors.green }]}>
                {money(totals.payable)}
              </Text>
              <Text style={styles.summaryUnit}>تومان</Text>
            </View>
          </View>

          <View style={styles.summaryFooter}>
            <View style={styles.footerPill}>
              <Ionicons name="people-outline" size={13} color={colors.primary} />
              <Text style={styles.footerText}>{toFa(contacts.length)} مشتری</Text>
            </View>
            <View style={styles.footerPill}>
              <Ionicons
                name="alert-circle-outline"
                size={13}
                color={totals.urgent > 0 ? colors.red : colors.textSoft}
              />
              <Text
                style={[
                  styles.footerText,
                  totals.urgent > 0 && { color: colors.red, fontWeight: '800' },
                ]}
              >
                {toFa(totals.debtors)} بدهکار
              </Text>
            </View>
            {totals.urgent > 0 ? (
              <View style={[styles.footerPill, styles.footerPillDanger]}>
                <Ionicons name="notifications" size={13} color={colors.red} />
                <Text style={[styles.footerText, { color: colors.red, fontWeight: '800' }]}>
                  {toFa(totals.urgent)} نیازمند یادآوری
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {!premium ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.planPill}
            onPress={() => navigation.navigate('Premium')}
          >
            <Ionicons name="diamond-outline" size={13} color={colors.amber} />
            <Text style={styles.planPillText}>
              نسخه رایگان — {toFa(contacts.length)} از {toFa(freeLimit)} مشتری
            </Text>
            <Text style={styles.planPillAction}>
              {isLimitReached(contacts.length) ? 'ارتقا' : `${toFa(remaining(contacts.length))} جای باقی‌مانده`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {pending.length > 0 || recentAuto.length > 0 ? (
        <View style={styles.smsWrap}>
          {pending.length > 0 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.smsBanner}
              onPress={() => navigation.navigate('SmsImport')}
            >
              <Ionicons name="mail-unread-outline" size={16} color={colors.amber} />
              <Text style={styles.smsBannerText}>
                {toFa(pending.length)} واریز بانکی در انتظار تأیید
              </Text>
              <Ionicons name="chevron-back" size={16} color={colors.muted} />
            </TouchableOpacity>
          ) : null}

          {recentAuto.length > 0 ? (
            <View style={styles.smsAuto}>
              <Ionicons name="checkmark-circle" size={16} color={colors.green} />
              <Text style={styles.smsAutoText} numberOfLines={2}>
                {recentAuto.length === 1
                  ? `واریز ${money(recentAuto[0].amount)} تومانی «${recentAuto[0].name}» خودکار ثبت شد`
                  : `${toFa(recentAuto.length)} واریز بانکی خودکار ثبت شد`}
              </Text>
              <TouchableOpacity onPress={clearRecentAuto} hitSlop={10}>
                <Ionicons name="close" size={15} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {letters.map((item) => (
            <Chip
              key={item}
              label={item === ALL ? 'همه' : item}
              active={letter === item}
              onPress={() => setLetter(item)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={contacts.length === 0 ? 'people-outline' : 'search-outline'}
            title={contacts.length === 0 ? 'هنوز مشتری‌ای ثبت نشده' : 'موردی پیدا نشد'}
            hint={
              contacts.length === 0
                ? 'با دکمه + اولین مشتری را اضافه کنید.'
                : 'عبارت جستجو یا حرف دیگری را امتحان کنید.'
            }
          />
        }
        ListFooterComponent={
          filtered.length > 0 ? (
            <Text style={styles.listHint}>برای حذف مشتری، کارت را نگه دارید.</Text>
          ) : null
        }
      />

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={addCustomer}
      >
        <Ionicons name="add" size={32} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 74,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconSpaced: { marginLeft: 8 },
  heroRight: { flexDirection: 'row', alignItems: 'center' },
  heroCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  heroTitle: { fontSize: 21, fontWeight: '800', color: colors.white, letterSpacing: 0.4 },
  heroSub: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 3,
    ...rtlCenter,
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
    paddingVertical: 0,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  summaryWrap: { paddingHorizontal: 16, marginTop: -52 },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingTop: 16,
    paddingBottom: 12,
    ...shadows.hero,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: {
    fontSize: 11,
    color: colors.textSoft,
    fontWeight: '800',
    ...rtlCenter,
  },
  summaryValue: { fontSize: 19, fontWeight: '800', marginTop: 5 },
  summaryUnit: { fontSize: 10.5, color: colors.muted, marginTop: 2, ...rtlCenter },
  summaryDivider: { width: 1, height: 44, backgroundColor: colors.border },
  summaryFooter: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 6,
    marginTop: 4,
  },
  footerPillDanger: { backgroundColor: colors.redSoft },
  footerText: { fontSize: 11, color: colors.textSoft, fontWeight: '700', marginRight: 4 },

  planPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
  },
  planPillText: { fontSize: 11, fontWeight: '800', color: '#8A6417', marginRight: 6 },
  planPillAction: { fontSize: 10.5, fontWeight: '700', color: '#A5814A', marginRight: 8 },

  chipsWrap: { marginTop: 14 },

  smsWrap: { paddingHorizontal: 16, marginTop: 10 },
  smsBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.amberSoft,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  smsBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#8A6417',
    marginRight: 7,
    ...rtl,
  },
  smsAuto: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smsAutoText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.greenDark,
    marginRight: 7,
    ...rtl,
  },
  chipsContent: { paddingHorizontal: 16 },

  listContent: { paddingHorizontal: 16, paddingTop: 12 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 10,
    ...shadows.card,
  },
  cardUrgent: { borderWidth: 1.4, borderColor: '#F7C7C7' },
  cardMain: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  name: { fontSize: 15.5, fontWeight: '800', color: colors.text, maxWidth: '88%', textAlign: 'right' },
  bell: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  phone: { fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'right' },
  amountCol: { alignItems: 'flex-end', minWidth: 84 },
  amount: { fontSize: 15, fontWeight: '800' },
  amountLabel: { fontSize: 10.5, fontWeight: '700', marginTop: 3, ...rtl },

  listHint: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
    ...rtlCenter,
  },

  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.float,
  },
});
