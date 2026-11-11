// ماشین حساب مالی — simple built-in calculator (Persian digits, ٬ grouping).
// Input comes only from the button grid, so the expression stays a clean ASCII
// string internally; the display renders it Persian via formatExpression().
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rtl, shadows } from '../theme';
import { evaluate, formatCalcResult, formatExpression } from '../utils/calc';
import { digits, getLocale, toEn } from '../utils/format';
import { ScreenHeader } from '../components/ui';
import { t } from '../i18n';
import { useLang } from '../i18n/LanguageContext';

const KEYS = [
  [
    { label: 'C', kind: 'clear', tone: 'red' },
    { label: '( )', kind: 'paren', tone: 'muted' },
    { label: '%', kind: 'op', tone: 'muted' },
    { label: '÷', kind: 'op', tone: 'accent' },
  ],
  [
    { label: '۷', kind: 'num' },
    { label: '۸', kind: 'num' },
    { label: '۹', kind: 'num' },
    { label: '×', kind: 'op', tone: 'accent' },
  ],
  [
    { label: '۴', kind: 'num' },
    { label: '۵', kind: 'num' },
    { label: '۶', kind: 'num' },
    { label: '−', kind: 'op', tone: 'accent' },
  ],
  [
    { label: '۱', kind: 'num' },
    { label: '۲', kind: 'num' },
    { label: '۳', kind: 'num' },
    { label: '+', kind: 'op', tone: 'accent' },
  ],
  [
    { label: '۰', kind: 'num' },
    { label: '.', kind: 'dot' },
    { label: '⌫', kind: 'back', tone: 'muted' },
    { label: '=', kind: 'eq', tone: 'primary' },
  ],
];

const OP_ASCII = { '÷': '/', '×': '*', '−': '-' };

export default function CalculatorScreen({ navigation }) {
  useLang(); // re-render when the app language changes
  const insets = useSafeAreaInsets();
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);

  const runEvaluate = (source) => {
    try {
      const value = evaluate(source);
      setResult(value);
      setError(false);
    } catch {
      setResult(null);
      setError(true);
    }
  };

  const press = (key) => {
    setError(false);
    switch (key.kind) {
      case 'num': {
        setExpr((e) => e + key.label);
        break;
      }
      case 'dot': {
        // no second dot inside the current number
        setExpr((e) => {
          const tail = e.split(/[^0-9.]/).pop() || '';
          if (tail.includes('.')) return e;
          if (tail === '') return `${e}0.`;
          return `${e}.`;
        });
        break;
      }
      case 'op': {
        const op = OP_ASCII[key.label];
        setExpr((e) => {
          if (!e) return op === '-' ? '-' : e;
          const last = e[e.length - 1];
          if ('+-*/'.includes(last)) return e.slice(0, -1) + op; // replace
          return e + op;
        });
        break;
      }
      case 'paren': {
        setExpr((e) => {
          const opens = (e.match(/\(/g) || []).length;
          const closes = (e.match(/\)/g) || []).length;
          const last = e[e.length - 1];
          // after a number/closing paren → close if possible, else open
          if (opens > closes && (/[0-9)%]/.test(last || ''))) return `${e})`;
          if (last && /[0-9)%]/.test(last) && opens === closes) return `${e}×(`;
          return `${e}(`;
        });
        break;
      }
      case '%': {
        setExpr((e) => {
          if (!e || !/[0-9)]$/.test(e)) return e;
          return `${e}%`;
        });
        break;
      }
      case 'back': {
        setExpr((e) => e.slice(0, -1));
        break;
      }
      case 'clear': {
        setExpr('');
        setResult(null);
        break;
      }
      case 'eq': {
        if (expr.trim()) runEvaluate(expr);
        break;
      }
      default:
        break;
    }
  };

  const preview = expr ? formatExpression(expr, getLocale()) : '';
  const shownResult = error
    ? t('خطا')
    : result === null
      ? ''
      : formatCalcResult(result, getLocale()) ?? t('خطا');

  const keyBg = (tone) =>
    tone === 'accent'
      ? { backgroundColor: colors.primarySoft, color: colors.primary }
      : tone === 'red'
        ? { backgroundColor: colors.redSoft, color: colors.red }
        : tone === 'muted'
          ? { backgroundColor: '#EFECF6', color: colors.textSoft }
          : tone === 'primary'
            ? { backgroundColor: colors.primary, color: colors.white }
            : { backgroundColor: colors.card, color: colors.text };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t('ماشین حساب مالی')}
        subtitle={t('محاسبه سریع مبالغ و درصدها')}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.displayCard}>
        <Text style={styles.expression} numberOfLines={2}>
          {preview || digits(0)}
        </Text>
        <Text
          style={[styles.result, error && { color: colors.red }]}
          numberOfLines={1}
        >
          {shownResult ? `= ${shownResult}` : ''}
        </Text>
      </View>

      <View style={[styles.pad, { paddingBottom: insets.bottom + 16 }]}>
        {KEYS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key) => {
              const tone = keyBg(key.tone);
              return (
                <TouchableOpacity
                  key={key.label}
                  activeOpacity={0.7}
                  onPress={() => press(key)}
                  style={[
                    styles.key,
                    { backgroundColor: tone.backgroundColor },
                    key.kind === 'eq' && styles.keyEq,
                  ]}
                >
                  <Text style={[styles.keyText, { color: tone.color }]}>
                    {getLocale() === 'en' ? toEn(key.label) : key.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  displayCard: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 18,
    ...shadows.card,
  },
  expression: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textSoft,
    textAlign: 'left',
    writingDirection: 'rtl',
    minHeight: 34,
    lineHeight: 34,
  },
  result: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
    textAlign: 'left',
    writingDirection: 'rtl',
    lineHeight: 46,
  },

  pad: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16 },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  key: {
    flex: 1,
    marginHorizontal: 5,
    height: 62,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  keyEq: { backgroundColor: colors.primary },
  keyText: { fontSize: 24, fontWeight: '800' },
});
