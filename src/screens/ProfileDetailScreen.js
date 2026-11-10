// مشتریان یک دسته — dynamic Persian letter chips (only letters that actually
// have customers) + alphabetical sections, exactly like the Home screen filter.
import React, { useEffect, useMemo, useState } from 'react';
import {
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, faText, radius, rtl, shadows, REMINDER_THRESHOLD } from '../theme';
import { money, toFa } from '../utils/format';
import { contactsOfProfile } from '../utils/profiles';
import { letterBuckets, lettersOf } from '../utils/grouping';
import { balanceOf, sortContacts, useContacts } from '../store/ContactsContext';
import { useProfiles } from '../store/ProfilesContext';
import { Avatar, Chip, EmptyState, IconButton, ScreenHeader } from '../components/ui';

const ALL = '__all__';

export default function ProfileDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { profileId = '' } = route.params || {};
  const { hydrated, profileById } = useProfiles();
  const { contacts } = useContacts();
  const [letter, setLetter] = useState(ALL);

  const profile = profileId ? profileById(profileId) : null;

  // The category can be deleted from its edit screen — never leave a dead page.
  useEffect(() => {
    if (hydrated && profileId && !profile) navigation.goBack();
  }, [hydrated, profileId, profile, navigation]);

  const sorted = useMemo(
    () => sortContacts(contactsOfProfile(contacts, profileId)),
    [contacts, profileId],
  );

  // Only letters that actually exist in THIS category (dynamic filter bar).
  const letters = useMemo(() => lettersOf(sorted), [sorted]);

  // A customer deletion can remove the selected letter — fall back to «همه».
  useEffect(() => {
    if (letter !== ALL && !letters.includes(letter)) setLetter(ALL);
  }, [letter, letters]);

  const filtered = useMemo(
    () => (letter === ALL ? sorted : sorted.filter((c) => c.letter === letter)),
    [sorted, letter],
  );

  const sections = useMemo(() => letterBuckets(filtered), [filtered]);

  const renderItem = ({ item }) => {
    const balance = balanceOf(item);
    const needsReminder = balance > REMINDER_THRESHOLD;
    const amountColor = balance > 0 ? colors.red : balance < 0 ? colors.green : colors.muted;
    const amountLabel = balance > 0 ? 'بدهکار' : balance < 0 ? 'بستانکار' : 'تسویه';

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
          <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
            {balance === 0 ? '۰' : money(balance)}
          </Text>
          <Text style={[styles.amountLabel, { color: amountColor }]}>{amountLabel}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const title = profile ? profile.name : 'بدون دسته';

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={title}
        subtitle={`${toFa(sorted.length)} مشتری`}
        onBack={() => navigation.goBack()}
        right={
          profileId ? (
            <IconButton
              name="create-outline"
              size={20}
              onPress={() => navigation.navigate('ProfileForm', { profileId })}
            />
          ) : undefined
        }
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
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
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
            icon={sorted.length === 0 ? 'pricetag-outline' : 'search-outline'}
            title={sorted.length === 0 ? 'این دسته مشتری ندارد' : 'موردی پیدا نشد'}
            hint={
              sorted.length === 0
                ? 'با دکمه + اولین مشتری این دسته را اضافه کنید.'
                : 'حرف دیگری را انتخاب کنید.'
            }
          />
        }
      />

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() =>
          navigation.navigate('CustomerForm', profileId ? { profileId } : {})
        }
      >
        <Ionicons name="add" size={32} color={colors.white} />
      </TouchableOpacity>
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
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLetterText: { fontSize: 12.5, fontWeight: '800', color: colors.primary },
  sectionCount: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
    marginRight: 8,
  },
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
