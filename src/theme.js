// Design tokens for the eKhata-style ledger UI.
// The whole interface is Persian (Farsi). Layout stays LTR for the shell, and
// Persian text is rendered with an RTL writing direction, right-aligned where it
// fills a line. Every screen receives its strings in Persian.
import { Platform } from 'react-native';

export const colors = {
  primary: '#6C3BD1',
  primaryDark: '#48208F',
  primaryLight: '#9B7BEA',
  primarySoft: '#F1EBFF',

  bg: '#F5F3FA',
  card: '#FFFFFF',
  border: '#EDEAF5',

  text: '#1F1B2E',
  textSoft: '#635D78',
  muted: '#9A94AC',

  green: '#0FA968',
  greenDark: '#0A8653',
  greenSoft: '#E6F7EF',

  red: '#E23F3F',
  redDark: '#BE2E2E',
  redSoft: '#FDEBEB',

  amber: '#EF9F2A',
  amberSoft: '#FEF4E4',

  white: '#FFFFFF',
  overlay: 'rgba(20, 12, 40, 0.55)',
};

// A customer is flagged (and auto-reminded) once their debt passes this amount,
// in Toman (۱۰۰٬۰۰۰ تومان = 1,000,000).
export const REMINDER_THRESHOLD = 1000000;

// Free plan cap. The premium (unlocked) plan removes it.
export const FREE_CUSTOMER_LIMIT = 10;

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#2A1E4F',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
    },
    android: { elevation: 3 },
    default: {},
  }),
  hero: Platform.select({
    ios: {
      shadowColor: '#3A1E6E',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
  float: Platform.select({
    ios: {
      shadowColor: '#3A1E6E',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 12,
    },
    android: { elevation: 9 },
    default: {},
  }),
};

// Persian/Arabic text: correct bidi direction, aligned with the LTR layout.
export const faText = { writingDirection: 'rtl', textAlign: 'left' };
// Persian text that must fill its line (inputs, centered headers).
export const faTextRight = { writingDirection: 'rtl', textAlign: 'right' };

// Short aliases kept for the screens that already import them.
export const rtl = faTextRight;
export const rtlCenter = { writingDirection: 'rtl', textAlign: 'center' };

export const typography = {
  hero: { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.textSoft },
  small: { fontSize: 12, color: colors.muted },
  label: { fontSize: 13, fontWeight: '700', color: colors.textSoft },
};
