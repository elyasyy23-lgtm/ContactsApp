// بدهکاران — full-screen list of every customer who owes money (balance > 0),
// with the same dynamic Persian letter chips + alphabetical sections as Home.
// Opened from the drawer's debtors card.
import React, { useEffect, useMemo, useState } from 'react';
import {
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, faText, radius, rtl, shadows, REMINDER_THRESHOLD } from '../theme';
import { money, toFa } from '../utils/format';
import { letterBuckets, lettersOf } from '../utils/grouping';
import { balanceOf, sortContacts, totalsOf, useContacts } from '../store/ContactsContext';
import { Avatar, Chip, EmptyState, ScreenHeader } from '../components/ui';

const ALL = '__all__';

export default function DebtorsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const [letter, setLetter] = useState(ALL);

  const debtors = useMemo(
    () => sortContacts(contacts.filter((c) => balanceOf(c) > 0)),
    [contacts],
  );

  const letters = useMemo(() => lettersOf(debtors), [debtors]);

  // A payment can empty the selected letter — fall back to «همه».
  useEffect(() => {
    if (letter !== ALL && !letters.includes(letter)) setLetter(ALL);
  }, [letter, letters]);

  const filtered = useMemo(
    () => (letter === ALL ? debtors : debtors.filter((c) => c.letter === letter)),
    [debtors, letter],
  );

  const sections = useMemo(() => letterBuckets(filtered), [filtered]);
  const totals = useMemo(() => totalsOf(debtors), [debtors]);

  const renderItem = ({ item }) => {
    const balance = balanceOf(item);
    const needsReminder = balance > REMINDER_THRESHOLD;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.card, needsReminder && styles.cardUrgent]}
        onPress={() => navigation.navigate('CustomerDetail', { contactId: item.id })}
      >
        <Avatar letter={item.letter} tone={needsReminder ? 'red' : 'purple'} />
        <View style={styles.cardMain}>
          <Text style={[styles.name, faText]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.phone, rtl]} numberOfLines={1}>
            {item.phone ? toFa(item.phone) : 'بدون شماره تلفن'}
          </Text>
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: colors.red }]} numberOfLines={1}>
            {money(balance)}
          </Text>
          <Text style={[styles.amountLabel, { color: colors.red }]}>بدهکار</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="بدهکاران"
        subtitle={`${toFa(debtors.length)} مشتری • جمع ${money(totals.receivable)} تومان`}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          <Chip label="همه" active={letter === ALL} onPress={() => setLetter(ALL)} />
          {letters.map((item) => (
            <Chip
              key={item}
              label={item}
              active={letter === item}
              onPress={() => setLetter(item)}
            />
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLetter}>
              <Text style={styles.sectionLetterText}>{section.title}</Text>
            </View>
            <Text style={styles.sectionCount}>{toFa(section.data.length)}</Text>
            <View style={styles.sectionLine} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={debtors.length === 0 ? 'checkmark-circle-outline' : 'search-outline'}
            title={debtors.length === 0 ? 'هیچ بدهکاری نیست' : 'موردی پیدا نشد'}
            hint={
              debtors.length === 0
                ? 'همه مشتریان حساب‌شان تسویه است.'
                : 'حرف دیگری را انتخاب کنید.'
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  chipsWrap: { marginTop: 14 },
  chipsContent: { paddingHorizontal: 16 },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },

  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sectionLetter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLetterText: { fontSize: 12.5, fontWeight: '800', color: colors.redDark },
  sectionCount: { fontSize: 11, color: colors.muted, fontWeight: '700', marginRight: 8 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border, marginRight: 8 },

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
  name: { fontSize: 15.5, fontWeight: '800', color: colors.text, textAlign: 'right' },
  phone: { fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'right' },
  amountCol: { alignItems: 'flex-end', minWidth: 84 },
  amount: { fontSize: 15, fontWeight: '800' },
  amountLabel: { fontSize: 10.5, fontWeight: '700', marginTop: 3, ...rtl },
});
