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
import { money, toEn, toFa } from '../utils/format';
import { balanceOf, sortContacts, useContacts } from '../store/ContactsContext';
import { lettersOf } from '../utils/grouping';
import { useSettings } from '../store/SettingsContext';
import { usePremium } from '../store/PremiumContext';
import { useSmsInbox } from '../store/SmsInboxContext';
import { Avatar, Chip, EmptyState } from '../components/ui';

const ALL = '__all__';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contacts, deleteContact } = useContacts();
  const { settings } = useSettings();
  const { locked } = usePremium();
  const { pending, recentAuto, clearRecentAuto } = useSmsInbox();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState(ALL);

  const sorted = useMemo(() => sortContacts(contacts), [contacts]);

  // Only letters that actually have customers — shared with the profile view.
  const letters = useMemo(() => [ALL, ...lettersOf(sorted)], [sorted]);

  // Global search: matches name OR phone, across every letter (Persian digits
  // typed on the Persian keyboard are folded to Latin before matching).
  const filtered = useMemo(() => {
    const q = toEn(query.trim().toLowerCase());
    if (q) {
      return sorted.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          toEn(c.cardNumber || '').includes(q),
      );
    }
    if (letter === ALL) return sorted;
    return sorted.filter((c) => c.letter === letter);
  }, [sorted, letter, query]);

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

  // Reminders are AUTOMATIC (owner decision 2026-11-10, final): the SMS fires
  // from the transaction save inside ContactsContext the moment a credit pushes
  // the debt above the threshold — no sweep on app open, no button. The manual
  // buttons on the customer page / Debtors list are only the fallback for Expo
  // Go, a denied SEND_SMS permission or a switch turned on late.

  const openDetail = (item) =>
    navigation.navigate('CustomerDetail', { contactId: item.id });

  const addCustomer = () => {
    if (locked) {
      Alert.alert(
        'دوره آزمایشی به پایان رسید',
        'برای ثبت مشتری جدید، نسخه کامل را فعال کنید.',
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
          {/* Search — the only other control in the minimal header. */}
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

          <View style={styles.heroCenter}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {settings.shopName || 'eKhata'}
            </Text>
          </View>

          {/* Hamburger — opens the drawer (slides in from the right). */}
          <TouchableOpacity
            style={styles.heroIcon}
            activeOpacity={0.75}
            onPress={() => navigation.openDrawer()}
          >
            <Ionicons name="menu" size={22} color={colors.white} />
          </TouchableOpacity>
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
    paddingBottom: 18,
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
  heroCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  heroTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.2,
    writingDirection: 'rtl',
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 6,
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

  chipsWrap: { marginTop: 12 },

  smsWrap: { paddingHorizontal: 16, marginTop: 12 },
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
