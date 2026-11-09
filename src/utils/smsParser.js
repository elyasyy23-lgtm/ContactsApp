// Parser for Iranian bank SMS messages + the reminder message builder.
//
// Expo Go cannot read the inbox (no native READ_SMS module), so the app asks the
// user to paste the bank message. This module turns that raw text into a
// structured suggestion: amount in Toman, direction and card hint.
import { groupCard, money } from './format';

const FA_TO_EN = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const BANKS = [
  'ملت', 'ملی', 'صادرات', 'تجارت', 'پارسیان', 'سامان', 'پاسارگاد', 'رفاه',
  'کشاورزی', 'سپه', 'مسکن', 'آینده', 'شهر', 'پست‌بانک', 'پست بانک', 'بلوبانک',
  'بلو', 'رسالت', 'اقتصاد نوین', 'مهر ایران', 'دی', 'سینا', 'کارآفرین',
  'گردشگری', 'خاورمیانه', 'قوامین', 'حکمت', 'ایران زمین', 'شهروند',
];

const IN_WORDS = [
  'واریز', 'واریزی', 'به حساب شما', 'افزایش موجودی', 'دریافت وجه',
  'انتقال به حساب', 'به حساب', 'کارت به کارت', 'شارژ حساب', 'اعتبار',
];
const OUT_WORDS = [
  'برداشت', 'خرید', 'کسر', 'پرداخت شد', 'انتقال از حساب', 'از حساب شما',
  'شماره کارت شما', 'کاهش موجودی', 'قبض', 'شارژ',
];

export function normalizeText(input) {
  return String(input || '')
    .replace(/[۰-۹٠-٩]/g, (d) => FA_TO_EN[d] || d)
    .replace(/[\u066c\u060c]/g, ',')
    .replace(/\u200c/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
}

function pickAmount(text) {
  // "1,250,000 ریال" / "250000 تومان" / "مبلغ: 500,000 ریال"
  const withUnit = /(\d[\d,.\s]{2,})\s*(ریال|ريال|تومان|تومن|IRR)/gi;
  const matches = [];
  let m;
  while ((m = withUnit.exec(text)) !== null) {
    const digits = m[1].replace(/[,\s.]/g, '');
    if (digits.length < 3) continue;
    const value = Number(digits);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unitRaw = m[2];
    const isToman = /تومان|تومن/.test(unitRaw);
    // The amount right after "مبلغ" is the transaction; one after "موجودی" is a balance.
    const before = text.slice(Math.max(0, m.index - 18), m.index);
    let score = 0;
    if (/مبلغ|به مبلغ/.test(before)) score += 10;
    if (/موجودی|مانده|بالانس/.test(before)) score -= 12;
    score -= m.index / 2000; // on a tie the earlier amount wins
    matches.push({
      raw: value,
      unit: isToman ? 'تومان' : 'ریال',
      // The app works in Toman: Rial messages are divided by 10.
      toman: isToman ? value : Math.round(value / 10),
      index: m.index,
      score,
    });
  }
  if (matches.length) {
    return matches.sort((a, b) => b.score - a.score)[0];
  }

  // Fallback: "مبلغ 1200000" with no unit at all (assume Toman).
  const loose = /مبلغ\D{0,8}(\d[\d,.\s]{3,})/i.exec(text);
  if (loose) {
    const value = Number(loose[1].replace(/[,\s.]/g, ''));
    if (Number.isFinite(value) && value > 0) {
      return { raw: value, unit: 'تومان', toman: value, index: loose.index };
    }
  }
  return null;
}

function pickDirection(text) {
  const outHits = OUT_WORDS.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  const inHits = IN_WORDS.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
  if (inHits === 0 && outHits === 0) return 'unknown';
  return inHits >= outHits ? 'in' : 'out';
}

function pickCard(text) {
  // Iranian banks mask the card as "*1234" / "**1234" / "6037****1234".
  const masked = /(?:\*+|•+)[\s-]*(\d{3,4})/.exec(text);
  if (masked) return masked[1].slice(-4);
  const starEnd = /(\d{4})[\s-]*(?:\*+|•+)/.exec(text);
  if (starEnd) return starEnd[1].slice(-4);
  const full = /(?:\b\d{4}[\s-]?){3}\d{4}\b/.exec(text);
  if (full) return full[0].replace(/\D/g, '').slice(-4);
  return null;
}

function pickBank(text) {
  return BANKS.find((b) => text.includes(b)) || null;
}

/**
 * parseBankSms(text) -> {
 *   ok, amountToman, rawAmount, unit, direction: 'in'|'out'|'unknown',
 *   card, bank, reason
 * }
 */
export function parseBankSms(input) {
  const text = normalizeText(input).trim();
  if (!text) {
    return { ok: false, reason: 'empty', direction: 'unknown' };
  }

  const amount = pickAmount(text);
  if (!amount) {
    return {
      ok: false,
      reason: 'no-amount',
      direction: pickDirection(text),
      bank: pickBank(text),
      card: pickCard(text),
    };
  }

  return {
    ok: true,
    amountToman: amount.toman,
    rawAmount: amount.raw,
    unit: amount.unit,
    direction: pickDirection(text),
    card: pickCard(text),
    bank: pickBank(text),
    reason: null,
  };
}

/**
 * The exact Persian reminder template. Kept verbatim on purpose — the shop owner
 * sends this to customers, so wording and line breaks must not drift.
 */
export function buildReminder({ customerName, amountToman, cardNumber, myName }) {
  const name = String(customerName || '').trim();
  const amount = money(amountToman); // Persian digits + thousands separator
  const card = groupCard(cardNumber) || String(cardNumber || '').trim();
  const owner = String(myName || '').trim();

  return (
    `${name} عزیز،\n` +
    `یادآوری می‌شود موجودی بدهی شما ${amount} تومان می‌باشد.\n` +
    `جهت تسویه، لطفاً مبلغ را به شماره کارت زیر واریز نمایید:\n` +
    `${card}\n` +
    `به نام: ${owner}\n` +
    `با تشکر از همکاری شما`
  );
}
