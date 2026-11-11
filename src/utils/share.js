// Share texts: the app link (Settings) and a per-transaction receipt
// (customer page). Pure string builders so scripts/verify.js can test them in
// Node without React Native.
import { money } from './format';
import { t } from '../i18n';
import { TOMAN_PER_UNIT } from './reminderGate';

/** Public repo — the "share the app" message points here. */
export const APP_LINK = 'https://github.com/elyasyy23-lgtm/ContactsApp';

/** Receipt / balance are always shown in Toman, never in ledger units. */
function tomanText(value) {
  const units = Math.round((Number(value) || 0) * TOMAN_PER_UNIT);
  return money(units);
}

/**
 * Share message for the app itself (Settings → Share the app).
 * `version` comes from src/buildInfo.js so the text always matches the build.
 */
export function buildAppShareText({ version } = {}) {
  const v = version || '';
  return [
    t('eKhata — دفتر حساب مشتریان'),
    '',
    t('دفتر حساب مشتریان، ساده و آفلاین: ثبت بدهی و دریافت، یادآوری خودکار پیامک، ثبت واریز از پیامک بانک و گزارش کامل.'),
    '',
    APP_LINK,
    v ? t('نسخه {v}', { v }) : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * One transaction as a receipt the shop can send to the customer.
 * `amount` is the stored ledger value; the receipt prints real Toman.
 */
export function buildReceipt({
  shopName,
  customerName,
  type,
  amount,
  date,
  time,
  note,
  balance,
} = {}) {
  const isPayment = type === 'payment';
  const label = isPayment ? t('دریافت وجه') : t('ثبت بدهی');
  const lines = [
    t('رسید {shop}', { shop: (shopName || '').trim() || 'eKhata' }),
    '──────────────',
    `${label}: ${tomanText(amount)} ${t('تومان')}`,
    t('مشتری: {name}', { name: (customerName || '').trim() || '—' }),
    t('تاریخ: {date}', { date: [date, time].filter(Boolean).join(' • ') || '—' }),
  ];
  if (note) lines.push(t('یادداشت: {note}', { note }));
  // Balance direction matters on a receipt: what the customer still owes.
  const owed = Number(balance) || 0;
  const balanceText = Math.abs(owed) === 0
    ? t('تسویه شده')
    : owed > 0
      ? t('بدهی مشتری: {amount} تومان', { amount: tomanText(Math.abs(owed)) })
      : t('بستانکاری مشتری: {amount} تومان', { amount: tomanText(Math.abs(owed)) });
  lines.push(balanceText);
  return lines.join('\n');
}

/** Guard used by the screens: an empty share sheet is worse than none. */
export function canShare(text) {
  return typeof text === 'string' && text.trim().length > 0;
}
