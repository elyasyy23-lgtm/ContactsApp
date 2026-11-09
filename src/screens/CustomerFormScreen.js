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
import { useContact, useContacts } from '../store/ContactsContext';
import { usePremium } from '../store/PremiumContext';
import { IconButton, ScreenHeader } from '../components/ui';

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
  const insets = useSafeAreaInsets();
  const { contactId } = route.params || {};
  const existing = useContact(contactId);
  const { contacts, addContact, updateContact, deleteContact } = useContacts();
  const { isLimitReached, freeLimit } = usePremium();

  const [name, setName] = useState(existing ? existing.name : '');
  const [phone, setPhone] = useState(existing ? existing.phone : '');
  const [email, setEmail] = useState(existing ? existing.email : '');
  const [address, setAddress] = useState(existing ? existing.address : '');
  const [cardNumber, setCardNumber] = useState(existing ? existing.cardNumber : '');

  const save = () => {
    if (!name.trim()) {
      Alert.alert('نام لازم است', 'نام مشتری را وارد کنید.');
      return;
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      cardNumber: cardNumber.replace(/\D/g, ''),
    };

    if (existing) {
      updateContact(existing.id, payload);
      navigation.goBack();
      return;
    }

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

    const created = addContact(payload);
    navigation.replace('CustomerDetail', { contactId: created.id });
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert('حذف مشتری', `«${existing.name}» با تمام تراکنش‌ها حذف شود؟`, [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
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
        title={existing ? 'ویرایش مشتری' : 'مشتری جدید'}
        subtitle={existing ? 'اطلاعات را به‌روز کنید' : 'اطلاعات مشتری را وارد کنید'}
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
              label="نام و نام خانوادگی"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              placeholder="مثلاً علی رضایی"
              autoFocus={!existing}
            />
            <Field
              label="شماره موبایل"
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              placeholder="09123456789"
              keyboardType="phone-pad"
              hint="شماره را با ارقام انگلیسی وارد کنید؛ برای ارسال پیامک یادآوری لازم است."
            />
            <Field
              label="ایمیل"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="example@mail.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="شماره کارت مشتری (اختیاری)"
              icon="card-outline"
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="6037 9974 1234 5678"
              keyboardType="number-pad"
              maxLength={19}
              hint="برای ثبت خودکار واریزها از پیامک بانکی؛ فقط ۴ رقم آخر هم کافی است."
            />
            <Field
              label="آدرس"
              icon="location-outline"
              value={address}
              onChangeText={setAddress}
              placeholder="آدرس مشتری"
              multiline
            />
          </View>

          <TouchableOpacity activeOpacity={0.88} style={styles.saveBtn} onPress={save}>
            <Ionicons name="checkmark-circle-outline" size={19} color={colors.white} />
            <Text style={styles.saveText}>
              {existing ? 'ذخیره تغییرات' : 'افزودن مشتری'}
            </Text>
          </TouchableOpacity>

          {existing ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.deleteBtn}
              onPress={confirmDelete}
            >
              <Ionicons name="trash-outline" size={16} color={colors.red} />
              <Text style={styles.deleteText}>حذف مشتری</Text>
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
