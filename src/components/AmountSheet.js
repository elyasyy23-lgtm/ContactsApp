// Bottom sheet for entering a transaction amount (accept payment / give credit).
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, rtl, shadows } from '../theme';
import { dateTime, money, parseAmount } from '../utils/format';
import { TRANSACTION } from '../store/ContactsContext';

export default function AmountSheet({
  visible,
  mode = TRANSACTION.PAYMENT,
  initialAmount = '',
  initialNote = '',
  editing = false,
  suggestAmount = 0,
  onClose,
  onSubmit,
  onDelete,
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const isPayment = mode === TRANSACTION.PAYMENT;
  const accent = isPayment ? colors.green : colors.red;
  const accentSoft = isPayment ? colors.greenSoft : colors.redSoft;

  useEffect(() => {
    if (visible) {
      setAmount(initialAmount ? String(initialAmount) : '');
      setNote(initialNote || '');
    }
  }, [visible, initialAmount, initialNote]);

  const parsed = useMemo(() => parseAmount(amount), [amount]);
  const stamp = useMemo(() => dateTime(new Date()), []);

  const submit = () => {
    if (!parsed || parsed <= 0) {
      Alert.alert('مبلغ نامعتبر', 'مبلغی بیشتر از صفر وارد کنید.');
      return;
    }
    onSubmit({ amount: parsed, note: note.trim() });
  };

  const confirmDelete = () => {
    Alert.alert('حذف تراکنش', 'این تراکنش حذف شود؟', [
      { text: 'انصراف', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIcon, { backgroundColor: accentSoft }]}>
              <Ionicons
                name={isPayment ? 'arrow-down' : 'arrow-up'}
                size={18}
                color={accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>
                {editing ? 'ویرایش تراکنش' : isPayment ? 'دریافت وجه' : 'ثبت بدهی'}
              </Text>
              <Text style={styles.sheetSubtitle}>
                {stamp.date} • {stamp.time}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textSoft} />
            </TouchableOpacity>
          </View>

          <View style={styles.amountRow}>
            <TextInput
              style={[styles.amountInput, { borderBottomColor: accent }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.muted}
              autoFocus={!editing}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Text style={styles.currency}>تومان</Text>
          </View>

          {parsed > 0 ? (
            <Text style={[styles.preview, { color: accent }]}>
              {money(parsed)} تومان
            </Text>
          ) : (
            <Text style={styles.previewMuted}>مبلغ را وارد کنید</Text>
          )}

          {suggestAmount > 0 && !editing ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.settleChip}
              onPress={() => setAmount(String(Math.round(suggestAmount)))}
            >
              <Ionicons name="checkmark-done-outline" size={14} color={colors.primary} />
              <Text style={styles.settleText}>
                تسویه کامل ({money(suggestAmount)} تومان)
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.noteLabel}>توضیح (اختیاری)</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="مثلاً پرداخت نقدی"
            placeholderTextColor={colors.muted}
          />

          <View style={styles.buttonsRow}>
            {editing ? (
              <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.saveBtn, { backgroundColor: accent }]}
              onPress={submit}
            >
              <Ionicons name="checkmark" size={19} color={colors.white} />
              <Text style={styles.saveText}>ثبت</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
    ...shadows.float,
  },
  handle: {
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sheetTitle: { fontSize: 16.5, fontWeight: '800', color: colors.text, ...rtl },
  sheetSubtitle: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 18,
  },
  amountInput: {
    minWidth: 130,
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    borderBottomWidth: 2,
    paddingBottom: 4,
  },
  currency: { fontSize: 15, fontWeight: '700', color: colors.textSoft, marginLeft: 8 },
  preview: { fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  previewMuted: { fontSize: 12.5, color: colors.muted, marginTop: 8, textAlign: 'center' },

  settleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
  },
  settleText: { fontSize: 12, fontWeight: '800', color: colors.primary, marginLeft: 5 },

  noteLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textSoft, marginTop: 12, ...rtl },
  noteInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  buttonsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  deleteBtn: {
    width: 52,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  saveBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.white, fontSize: 16, fontWeight: '800', marginLeft: 6 },
});
