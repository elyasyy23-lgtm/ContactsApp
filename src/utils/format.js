// Formatting helpers: money (Toman), amounts, Jalali (Shamsi) dates.
// The UI is Persian by default, so every displayed number goes through toFa();
// stored values and user input stay Latin digits (TextInput = numeric).
//
// Locale (v12): setLocale('en') switches money/dates/times to Latin digits and
// Gregorian dates for the English UI. Default is 'fa' so the Node unit tests
// in scripts/verify.js keep seeing the Persian formats.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

let locale = 'fa';

/** 'fa' (default) or 'en' — switched by the Language provider. */
export function setLocale(next) {
  locale = next === 'en' ? 'en' : 'fa';
}

export function getLocale() {
  return locale;
}

/** Locale-aware digit rendering for counts/phones: 123 → ۱۲۳ (fa) / 123 (en). */
export function digits(value) {
  return locale === 'en' ? String(value ?? '') : toFa(value);
}

/** "1234" -> "۱۲۳۴" (display only) */
export function toFa(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** "۱۲۳۴" -> "1234" (input parsing) */
export function toEn(value) {
  return String(value ?? '').replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** 1234567 -> "1,234,567" (Latin digits — internal / tests / card numbers) */
export function group(value) {
  const n = Math.round(Math.abs(Number(value) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Money display for Toman amounts: 1234567 -> "۱٬۲۳۴٬۵۶۷" (fa) / "1,234,567" (en) */
export function money(value) {
  const grouped = group(value);
  return locale === 'en' ? grouped : toFa(grouped).replace(/,/g, '٬');
}

/** Strips separators from a user-typed amount: "1,200,000" -> 1200000 */
export function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,\s\u066c\u200c]/g, '')
    .replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** "6037997412345678" -> "6037 9974 1234 5678" */
export function groupCard(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Gregorian Date -> { jy, jm, jd } (Jalali calendar, 33-year cycle algorithm). */
export function toJalali(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  let gy = d.getFullYear();
  const gm = d.getMonth() + 1;
  const gd = d.getDate();
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    gDaysInMonth[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

/** fa: "۱۴۰۵/۰۸/۱۷" (Jalali) — en: "2026/11/02" (Gregorian, Latin digits) */
export function jalaliDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  if (locale === 'en') return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  const j = toJalali(d);
  if (!j) return '';
  return toFa(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`);
}

/** fa: "۱۴:۰۵" — en: "14:05" */
export function clockTime(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const text = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return locale === 'en' ? text : toFa(text);
}

/** Timestamp -> { date: "1405/08/17", time: "14:05" } */
export function dateTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return { date: jalaliDate(d), time: clockTime(d) };
}

/** Absolute position of a Persian letter in the alphabet (for sorting). */
const FA_ALPHABET = 'آاأبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';
export function faLetterIndex(ch) {
  if (!ch) return 999;
  const i = FA_ALPHABET.indexOf(ch);
  return i === -1 ? 900 : i;
}

/** First letter of a name, normalised for grouping. */
export function initialOf(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0);
}
