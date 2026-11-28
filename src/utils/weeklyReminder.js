// Pure helpers for the weekly debt reminder (configurable weekday/time).
//
// This file is deliberately free of React / react-native imports so scripts/verify.js
// can require it from plain Node. The customer-facing text is ALWAYS Persian,
// independent of the app's fa/en UI locale. The existing crossing reminder in
// src/utils/smsParser.js is untouched; this is a separate weekly message.

import { group, groupCard, toFa } from './format';
import { REMINDER_THRESHOLD, TOMAN_PER_UNIT } from './reminderGate';

/**
 * Default schedule: Friday 10:00 (JS weekday 5 = Friday, 0 = Sunday).
 * Weekday: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
 * Hour: 0-23, Minute: 0-59
 */
export const DEFAULT_WEEKLY_WEEKDAY = 5;
export const DEFAULT_WEEKLY_HOUR = 10;
export const DEFAULT_WEEKLY_MINUTE = 0;

const clampWeeklyInt = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const truncated = Math.trunc(number);
  return truncated < min || truncated > max ? fallback : truncated;
};

/**
 * Coerce a stored/edited schedule into valid values.
 * IMPORTANT: 0 IS a valid value (Sunday, 00:xx) — never use `|| default`,
 * which silently turned Sunday into Friday and 00:00 into 10:00.
 * Missing/invalid fields fall back to the Friday 10:00 default.
 */
export function normalizeWeeklySchedule({ weekday, hour, minute } = {}) {
  return {
    weekday: clampWeeklyInt(weekday, 0, 6, DEFAULT_WEEKLY_WEEKDAY),
    hour: clampWeeklyInt(hour, 0, 23, DEFAULT_WEEKLY_HOUR),
    minute: clampWeeklyInt(minute, 0, 59, DEFAULT_WEEKLY_MINUTE),
  };
}

/**
 * The native module (Android `java.util.Calendar`) counts weekdays as
 * 1=Sunday … 7=Saturday, while the JS side (and the UI chips) use
 * 0=Sunday … 6=Saturday. Every value crossing the bridge must be shifted by
 * one, otherwise the alarm fires one day early (Saturday → Friday).
 */
export function toNativeWeekday(jsWeekday) {
  const value = Number(jsWeekday);
  const safe = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_WEEKLY_WEEKDAY;
  return (((safe % 7) + 7) % 7) + 1;
}

export function fromNativeWeekday(nativeWeekday) {
  const value = Number(nativeWeekday);
  const safe = Number.isFinite(value) ? Math.trunc(value) : 1;
  return ((((safe - 1) % 7) + 7) % 7);
}
export const WEEKLY_CATCH_UP_MS = 24 * 60 * 60 * 1000;
export const WEEKLY_REMINDER_THRESHOLD = REMINDER_THRESHOLD;

const pad2 = (n) => String(n).padStart(2, '0');

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (value === null || value === undefined || value === '') return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function weekdayAtTime(date, weekday, hour, minute) {
  const d = toDate(date);
  if (!d) return null;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
  const delta = (target.getDay() - weekday + 7) % 7;
  target.setDate(target.getDate() - delta);
  return target;
}

/** The slot key for `now` based on the configured weekday/hour/minute. */
export function weeklySlotFor(now = new Date(), weekday = DEFAULT_WEEKLY_WEEKDAY, hour = DEFAULT_WEEKLY_HOUR, minute = DEFAULT_WEEKLY_MINUTE) {
  const slotDate = weekdayAtTime(now, weekday, hour, minute);
  if (!slotDate) return null;
  return `${slotDate.getFullYear()}-${pad2(slotDate.getMonth() + 1)}-${pad2(slotDate.getDate())}`;
}

/** Convert a `YYYY-MM-DD` slot key back to its local scheduled Date. */
export function weeklySlotDate(slotKey, hour = DEFAULT_WEEKLY_HOUR, minute = DEFAULT_WEEKLY_MINUTE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(slotKey || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/** True when `at` falls inside the scheduled slot's catch-up window. */
export function inWeeklyDueWindow(at = new Date(), slotKey = null, hour = DEFAULT_WEEKLY_HOUR, minute = DEFAULT_WEEKLY_MINUTE) {
  const date = toDate(at);
  const slotDate = weeklySlotDate(slotKey || weeklySlotFor(date, undefined, hour, minute), hour, minute);
  if (!date || !slotDate) return false;
  const time = date.getTime();
  return time >= slotDate.getTime() && time < slotDate.getTime() + WEEKLY_CATCH_UP_MS;
}

/** Persist this slot when a crossing SMS was already sent inside the due window. */
export function weeklySlotForCrossingSentAt(at = new Date(), hour = DEFAULT_WEEKLY_HOUR, minute = DEFAULT_WEEKLY_MINUTE) {
  return inWeeklyDueWindow(at, null, hour, minute) ? weeklySlotFor(at, undefined, hour, minute) : null;
}

/**
 * Pure weekly decision. Sending itself stays silent-only in the app layer.
 *   action: 'send' when a weekly SMS is due, otherwise 'none'
 *   week:   the slot key (null when no valid time was supplied)
 */
export function weeklyReminderDecision({
  now = new Date(),
  sentWeek = '',
  balance = 0,
  settingsReady = false,
  hasPhone = false,
  threshold = WEEKLY_REMINDER_THRESHOLD,
  weekday = DEFAULT_WEEKLY_WEEKDAY,
  hour = DEFAULT_WEEKLY_HOUR,
  minute = DEFAULT_WEEKLY_MINUTE,
  weeklyReminderEnabled = false, // per-customer weekly reminder is OPT-IN: missing/undefined means OFF
} = {}) {
  const slot = weeklySlotFor(now, weekday, hour, minute);
  if (!slot) return { action: 'none', week: null };
  if (String(sentWeek || '') === slot) return { action: 'none', week: slot };
  if (!inWeeklyDueWindow(now, slot, hour, minute)) return { action: 'none', week: slot };
  // CRITICAL: balance must be STRICTLY GREATER than threshold (1,000,000 Toman = 1000 ledger units)
  if ((Number(balance) || 0) <= (Number(threshold) || 0)) return { action: 'none', week: slot };
  if (!settingsReady || !hasPhone) return { action: 'none', week: slot };
  // Per-customer opt-in: only an explicit `true` allows the weekly scheduled
  // reminder. Missing/undefined/false all block it (old records stay OFF).
  // Does NOT affect the existing threshold-crossing debt reminder.
  if (weeklyReminderEnabled !== true) return { action: 'none', week: slot };
  return { action: 'send', week: slot };
}

/** Delay to the next useful scheduler tick — 0 means "send now". */
export function nextWeeklyCheckDelayMs({
  now = new Date(),
  sentWeek = '',
  weekday = DEFAULT_WEEKLY_WEEKDAY,
  hour = DEFAULT_WEEKLY_HOUR,
  minute = DEFAULT_WEEKLY_MINUTE,
} = {}) {
  const date = toDate(now);
  if (!date) return WEEKLY_CATCH_UP_MS;
  const slot = weeklySlotFor(date, weekday, hour, minute);
  const slotDate = weeklySlotDate(slot, hour, minute);
  if (!slotDate) return WEEKLY_CATCH_UP_MS;

  const time = date.getTime();
  const slotTime = slotDate.getTime();
  const alreadySent = String(sentWeek || '') === slot;

  if (time < slotTime) return Math.max(0, slotTime - time);
  if (!alreadySent && time < slotTime + WEEKLY_CATCH_UP_MS) return 0;

  const next = new Date(slotDate.getTime());
  next.setDate(next.getDate() + 7);
  return Math.max(0, next.getTime() - time);
}

/**
 * The exact owner-approved weekly message. `amount` is in ledger units;
 * the customer sees real Tomans (× 1,000). Digits are Persian ALWAYS; no global
 * locale helper or money() is used here.
 */
export function buildWeeklyReminder({ customerName, amount, cardNumber } = {}) {
  const name = String(customerName || '').trim();
  const toman = Math.round((Number(amount) || 0) * TOMAN_PER_UNIT);
  const amountText = toFa(group(toman)).replace(/,/g, '٬');
  const card = groupCard(cardNumber) || String(cardNumber || '').trim();

  return (
    `${name} عزیز، صبح ${getWeekdayName(DEFAULT_WEEKLY_WEEKDAY)}‌تان بخیر.\n` +
    `امیدواریم آخر هفته خوبی داشته باشید.\n` +
    `یادآوری می‌شود بدهی شما ${amountText} تومان می‌باشد.\n` +
    `جهت تسویه، لطفاً مبلغ را به شماره کارت زیر واریز نمایید:\n` +
    `${card}\n` +
    `به نام: بهرام یعقوبی\n` +
    `لطفاً پس از واریز، متن رسید تراکنش را برای این شماره ارسال نمایید.\n` +
    `با تشکر از همکاری شما`
  );
}

/** Weekday names in Persian for the message template (Friday default). */
function getWeekdayName(weekday) {
  const names = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
  return names[weekday] || names[DEFAULT_WEEKLY_WEEKDAY];
}