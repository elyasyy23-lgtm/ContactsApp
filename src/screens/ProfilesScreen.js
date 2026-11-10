// دسته‌بندی مشتریان — list of every customer category with its customer count.
// Tapping a row opens that category's customers; long-press (or the pencil inside
// the edit screen) renames it.
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, rtlCenter, shadows } from '../theme';
import { toFa } from '../utils/format';
import { profileCounts } from '../utils/profiles';
import { useContacts } from '../store/ContactsContext';
import { useProfiles } from '../store/ProfilesContext';
import { EmptyState, IconButton, ScreenHeader } from '../components/ui';

function ProfileRow({ icon, name, count, muted, onPress, onLongPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={[styles.rowIcon, muted && styles.rowIconMuted]}>
        <Ionicons name={icon} size={19} color={muted ? colors.muted : colors.primary} />
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowName, muted && { color: colors.textSoft }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.rowCount}>
          {count > 0 ? `${toFa(count)} مشتری` : 'بدون مشتری'}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default function ProfilesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { profiles } = useProfiles();
  const { contacts } = useContacts();

  const counts = useMemo(() => profileCounts(contacts), [contacts]);
  const unassigned = counts[''] || 0;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="دسته‌بندی مشتریان"
        subtitle={`${toFa(profiles.length)} دسته`}
        onBack={() => navigation.goBack()}
        right={<IconButton name="add" onPress={() => navigation.navigate('ProfileForm', {})} />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hint}>
          هر مشتری را در یک دسته بگذارید تا حساب‌های فروشگاه و شخصی جدا بمانند.
        </Text>

        {unassigned > 0 ? (
          <ProfileRow
            icon="albums-outline"
            name="بدون دسته"
            count={unassigned}
            muted
            onPress={() => navigation.navigate('ProfileDetail', { profileId: '' })}
          />
        ) : null}

        {profiles.map((profile) => (
          <ProfileRow
            key={profile.id}
            icon="pricetag-outline"
            name={profile.name}
            count={counts[profile.id] || 0}
            onPress={() => navigation.navigate('ProfileDetail', { profileId: profile.id })}
            onLongPress={() =>
              navigation.navigate('ProfileForm', { profileId: profile.id })
            }
          />
        ))}

        {profiles.length === 0 ? (
          <EmptyState
            icon="pricetags-outline"
            title="هنوز دسته‌ای ندارید"
            hint="با دکمه + یک دسته بسازید؛ مثلاً «فروشگاه» یا «شخصی»."
          />
        ) : null}

        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.addBtn}
          onPress={() => navigation.navigate('ProfileForm', {})}
        >
          <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
          <Text style={styles.addText}>دسته جدید</Text>
        </TouchableOpacity>

        <Text style={styles.listHint}>برای ویرایش یا حذف دسته، نام آن را نگه دارید.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  hint: {
    fontSize: 11.5,
    color: colors.muted,
    lineHeight: 19,
    marginBottom: 12,
    ...rtl,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 13,
    marginBottom: 10,
    ...shadows.card,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 11,
  },
  rowIconMuted: { backgroundColor: colors.bg },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '800', color: colors.text, ...rtl },
  rowCount: { fontSize: 11.5, color: colors.muted, marginTop: 4, ...rtl },

  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    height: 50,
    marginTop: 6,
    borderWidth: 1.4,
    borderColor: '#DCD2F6',
  },
  addText: { fontSize: 14, fontWeight: '800', color: colors.primary, marginRight: 7 },

  listHint: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 16,
    ...rtlCenter,
  },
});
