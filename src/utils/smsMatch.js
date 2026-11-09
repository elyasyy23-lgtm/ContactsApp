// Matches a bank deposit SMS to one of the shop's customers.
//
// Confidence model:
//   high → the customer's saved card last-4 appears in the message, or the full
//          name appears in the text. Recorded automatically.
//   low  → only one word of the name matched. Shown in the pending list for a
//          single tap confirmation.
//   none → nothing matched, or the message is not a deposit.
import { normalizeText, parseBankSms } from './smsParser';

const NAME_STOP_WORDS = new Set([
  'خانم', 'آقای', 'آقا', 'جناب', 'سرکار', 'محترم', 'مشتری', 'شرکت', 'فروشگاه',
  'بانک', 'واریز', 'برداشت', 'حساب', 'کارت', 'مبلغ', 'تومان', 'ریال',
]);

export function digitsOf(value) {
  // normalizeText first so Persian digits (۶۰۳۷…) are not stripped.
  return normalizeText(value).replace(/\D/g, '');
}

/** Persian-safe comparison key: latin digits, ی/ک normalized, no punctuation. */
export function nameKey(value) {
  return normalizeText(value)
    .replace(/[^\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable idempotency key so the same SMS is never recorded twice. */
export function smsKey(sms) {
  const body = normalizeText(sms && sms.body ? sms.body : '').replace(/\s+/g, ' ').trim();
  const address = String((sms && sms.address) || '');
  const stamp = Number((sms && sms.timestamp) || 0);
  return `${address}|${stamp}|${body}`;
}

/**
 * matchSms(sms, customers, options) -> {
 *   parsed, match, confidence, reason, candidates
 * }
 *
 * options.ignoreCardLast4 — the shop's own card last-4. Bank SMS often mention
 * the receiving card, which must never be treated as the customer's card.
 */
export function matchSms(sms, customers = [], options = {}) {
  const body = String((sms && sms.body) || '');
  const parsed = parseBankSms(body);
  const ignoredCard = digitsOf(options.ignoreCardLast4).slice(-4);

  if (!parsed.ok) {
    return { parsed, match: null, confidence: 'none', reason: 'no-amount', candidates: [] };
  }
  if (parsed.direction === 'out') {
    return { parsed, match: null, confidence: 'none', reason: 'outgoing', candidates: [] };
  }

  // Only the message body is searched for names — the sender address is a bank
  // short-code (e.g. "BankMellat") and would create false matches.
  const text = nameKey(body);
  const card = digitsOf(parsed.card).slice(-4);

  const byCard = [];
  const byFullName = [];
  const byPartialName = [];

  customers.forEach((customer) => {
    const customerCard = digitsOf(customer.cardNumber);
    if (
      card &&
      card !== ignoredCard &&
      customerCard.length >= 4 &&
      customerCard.slice(-4) === card
    ) {
      byCard.push(customer);
      return;
    }

    const key = nameKey(customer.name);
    if (key.length >= 5 && text.includes(key)) {
      byFullName.push(customer);
      return;
    }

    const words = key.split(' ').filter((word) => word.length >= 4 && !NAME_STOP_WORDS.has(word));
    if (words.some((word) => text.includes(word))) {
      byPartialName.push(customer);
    }
  });

  if (byCard.length === 1) {
    return { parsed, match: byCard[0], confidence: 'high', reason: 'card', candidates: byCard };
  }
  if (byFullName.length === 1) {
    return { parsed, match: byFullName[0], confidence: 'high', reason: 'name', candidates: byFullName };
  }
  if (byCard.length > 1) {
    return { parsed, match: null, confidence: 'low', reason: 'ambiguous', candidates: byCard };
  }
  if (byFullName.length > 1) {
    return { parsed, match: null, confidence: 'low', reason: 'ambiguous', candidates: byFullName };
  }
  if (byPartialName.length === 1) {
    return {
      parsed,
      match: byPartialName[0],
      confidence: 'low',
      reason: 'partial-name',
      candidates: byPartialName,
    };
  }
  if (byPartialName.length > 1) {
    return {
      parsed,
      match: null,
      confidence: 'low',
      reason: 'ambiguous',
      candidates: byPartialName,
    };
  }
  return { parsed, match: null, confidence: 'none', reason: 'unmatched', candidates: [] };
}
