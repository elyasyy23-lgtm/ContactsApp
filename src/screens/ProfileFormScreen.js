// ساخت/ویرایش/حذف دسته (پروفایل) مشتری.
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, shadows } from '../theme';
import { toFa } from '../utils/format';
import { contactsOfProfile, PROFILE_NAME_MAX } from '../utils/profiles';
import { useContacts } from '../store/ContactsContext';
import { useProfiles } from '../store/ProfilesContext';
import { IconButton, ScreenHeader } from '../components/ui';

export default function ProfileFormScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { profileId } = route.params || {};
  const { profiles, addProfile, updateProfile, deleteProfile, profileById } = useProfiles();
  const { contacts, clearProfileFromContacts } = useContacts();

  const existing = profileId ? profileById(profileId) : null;
  const memberCount = existing ? contactsOfProfile(contacts, existing.id).length : 0;

  const [name, setName] = useState(existing ? existing.name : '');

  const showReason = (reason) => {
    if (reason === 'empty') {
      Alert.alert('نام دسته لازم است', 'یک نام کوتاه برای دسته وارد کنید.');
      return;
    }
    if (reason === 'duplicate') {
      Alert.alert('نام تکراری', 'دسته‌ای با همین نام از قبل وجود دارد.');
      return;
    }
    Alert.alert('ذخیره نشد', 'مشکلی پیش آمد؛ دوباره تلاش کنید.');
  };

  const save = () => {
    if (existing) {
      const result = updateProfile(existing.id, name);
      if (!result.ok) {
        showReason(result.reason);
        return;
      }
      navigation.goBack();
      return;
    }

    const result = addProfile(name);
    if (!result.ok) {
      showReason(result.reason);
      return;
    }
    navigation.replace('ProfileDetail', { profileId: result.profile.id });
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(
      'حذف دسته',
      memberCount > 0
        ? `«${existing.name}» حذف شود؟ ${toFa(memberCount)} مشتری به «بدون دسته» منتقل می‌شوند.`
        : `«${existing.name}» حذف شود؟`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => {
            clearProfileFromContacts(existing.id);
            deleteProfile(existing.id);
            navigation.goBack();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={existing ? 'ویرایش دسته' : 'دسته جدید'}
        subtitle={
          existing
            ? memberCount > 0
              ? `${toFa(memberCount)} مشتری در این دسته`
              : 'بدون مشتری'
            : 'مثلاً فروشگاه یا شخصی'
        }
        onBack={() => navigation.goBack()}
        right={<IconButton name="checkmark" onPress={save} size={22} />}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.label}>نام دسته</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="pricetag-outline" size={17} color={colors.muted} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="مثلاً فروشگاه"
                placeholderTextColor={colors.muted}
                maxLength={PROFILE_NAME_MAX}
                autoFocus={!existing}
              />
            </View>
            <Text style={styles.hint}>
              هر مشتری می‌تواند در یکی از این دسته‌ها قرار بگیرد؛ حذف دسته، مشتری‌ها را حذف
              نمی‌کند.
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.88} style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
            <Text style={styles.saveText}>
              {existing ? 'ذخیره تغییرات' : 'ساخت دسته'}
            </Text>
          </TouchableOpacity>

          {existing ? (
            <TouchableOpacity activeOpacity={0.8} style={styles.deleteBtn} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.deleteText}>حذف دسته</Text>
            </TouchableOpacity>
          ) : null}

          {profiles.length > 0 ? (
            <Text style={styles.existing}>
              دسته‌های موجود: {profiles.map((p) => p.name).join('، ')}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 16,
    ...shadows.card,
  },
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
  hint: { fontSize: 11, color: colors.muted, marginTop: 10, lineHeight: 18, ...rtl },

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
  saveText: { color: colors.white, fontSize: 15.5, fontWeight: '800', marginRight: 7 },

  deleteBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F6DADA',
  },
  deleteText: { fontSize: 13.5, fontWeight: '800', color: colors.red, marginRight: 7 },

  existing: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 18,
    lineHeight: 19,
    textAlign: 'center',
    ...rtl,
  },
});
