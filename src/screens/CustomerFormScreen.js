import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, shadows } from '../theme';
import { useContact, useContacts } from '../store/ContactsContext';
import { usePremium } from '../store/PremiumContext';
import { useProfiles } from '../store/ProfilesContext';
import { Chip, IconButton, ScreenHeader } from '../components/ui';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

function Field({ label, icon, hint, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={17} color={colors.muted} />
        <TextInput
          style={[styles.input, props.multiline && styles.inputMultiline]}
          placeholderTextColor={colors.muted}
          {...props}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export default function CustomerFormScreen({ navigation, route }) {
  useLang(); // re-render when the app language changes
  const insets = useSafeAreaInsets();
  const { contactId, profileId: presetProfileId } = route.params || {};
  const existing = useContact(contactId);
  const { contacts, addContact, updateContact, deleteContact } = useContacts();
  const { locked } = usePremium();
  const { profiles } = useProfiles();

  const [name, setName] = useState(existing ? existing.name : '');
  const [phone, setPhone] = useState(existing ? existing.phone : '');
  const [email, setEmail] = useState(existing ? existing.email : '');
  const [address, setAddress] = useState(existing ? existing.address : '');
  const [cardNumber, setCardNumber] = useState(existing ? existing.cardNumber : '');
  // '' = بدون دسته. A new customer opened from a category starts pre-filled.
  const [profileId, setProfileId] = useState(
    existing ? existing.profileId || '' : presetProfileId || '',
  );
  // Per-customer reminder switch — default ON; old records normalize to ON.
  const [reminderEnabled, setReminderEnabled] = useState(
    existing ? existing.reminderEnabled !== false : true,
  );

  const save = () => {
    if (!name.trim()) {
      Alert.alert(t('نام لازم است'), t('نام مشتری را وارد کنید.'));
      return;
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      cardNumber: cardNumber.replace(/\D/g, ''),
      profileId: profiles.some((p) => p.id === profileId) ? profileId : '',
      reminderEnabled,
    };

    if (existing) {
      updateContact(existing.id, payload);
      navigation.goBack();
      return;
    }

    if (locked) {
      Alert.alert(t('دوره آزمایشی به پایان رسید'), t('برای ثبت مشتری جدید، نسخه کامل را فعال کنید.'), [
        { text: t('بعداً'), style: 'cancel' },
        { text: t('نسخه ویژه'), onPress: () => navigation.navigate('Premium') },
      ]);
      return;
    }

    const created = addContact(payload);
    navigation.replace('CustomerDetail', { contactId: created.id });
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(t('حذف مشتری'), `«${existing.name}» با تمام تراکنش‌ها حذف شود؟`, [
      { text: t('انصراف'), style: 'cancel' },
      {
        text: t('حذف'),
        style: 'destructive',
        onPress: () => {
          deleteContact(existing.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={existing ? t('ویرایش مشتری') : t('مشتری جدید')}
        subtitle={existing ? t('اطلاعات را به‌روز کنید') : t('اطلاعات مشتری را وارد کنید')}
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
            <Field
              label={t('نام و نام خانوادگی')}
              icon="person-outline"
              value={name}
              onChangeText={setName}
              placeholder={t('مثلاً علی رضایی')}
              autoFocus={!existing}
            />
            <Field
              label={t('شماره موبایل')}
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              placeholder="09123456789"
              keyboardType="phone-pad"
              hint={t('شماره را با ارقام انگلیسی وارد کنید؛ برای ارسال پیامک یادآوری لازم است.')}
            />
            <Field
              label={t('ایمیل')}
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="example@mail.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label={t('شماره کارت مشتری (اختیاری)')}
              icon="card-outline"
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="6037 9974 1234 5678"
              keyboardType="number-pad"
              maxLength={19}
              hint={t('برای ثبت خودکار واریزها از پیامک بانکی؛ فقط ۴ رقم آخر هم کافی است.')}
            />
            <Field
              label={t('آدرس')}
              icon="location-outline"
              value={address}
              onChangeText={setAddress}
              placeholder={t('آدرس مشتری')}
              multiline
            />

            <View style={styles.profileField}>
              <Text style={styles.label}>{t('دسته مشتری')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.profileChips}
                keyboardShouldPersistTaps="handled"
              >
                <Chip
                  label={t('بدون دسته')}
                  active={!profileId}
                  onPress={() => setProfileId('')}
                />
                {profiles.map((profile) => (
                  <Chip
                    key={profile.id}
                    label={profile.name}
                    active={profileId === profile.id}
                    onPress={() => setProfileId(profile.id)}
                  />
                ))}
              </ScrollView>
            </View>
            <View style={styles.switchCard}>
              <View style={styles.switchIcon}>
                <Ionicons
                  name="paper-plane-outline"
                  size={17}
                  color={reminderEnabled ? colors.primary : colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>{t('ارسال پیامک یادآوری')}</Text>
                <Text style={styles.switchSub}>
                  {t('دکمه ارسال یادآوری برای این مشتری کار کند (ارسال بی‌صدا با خودِ برنامه).')}
                </Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={reminderEnabled ? colors.primary : colors.white}
              />
            </View>
          </View>

          <TouchableOpacity activeOpacity={0.88} style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
            <Text style={styles.saveText}>
              {existing ? t('ذخیره تغییرات') : t('افزودن مشتری')}
            </Text>
          </TouchableOpacity>

          {existing ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.deleteBtn}
              onPress={confirmDelete}
            >
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.deleteText}>{t('حذف مشتری')}</Text>
            </TouchableOpacity>
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
  field: { marginBottom: 14 },
  profileField: { marginBottom: 2 },
  profileChips: { paddingBottom: 2 },
  switchCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  switchIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  switchTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, ...rtl },
  switchSub: { fontSize: 10.5, color: colors.muted, marginTop: 3, lineHeight: 16, ...rtl },
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
  inputMultiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 18, ...rtl },

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
});
