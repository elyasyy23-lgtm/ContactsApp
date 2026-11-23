import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import * as SmsReader from '../../modules/sms-reader';
import { balanceOf, useContacts } from '../store/ContactsContext';
import { useSettings } from '../store/SettingsContext';
import {
  WEEKLY_REMINDER_THRESHOLD,
  buildWeeklyReminder,
  weeklySlotFor,
  weeklySlotForCrossingSentAt,
  DEFAULT_WEEKLY_WEEKDAY,
  DEFAULT_WEEKLY_HOUR,
  DEFAULT_WEEKLY_MINUTE,
} from '../utils/weeklyReminder';

function contactId(contact) {
  return String(contact?.id ?? contact?.contactId ?? '');
}

function contactPhone(contact) {
  return String(contact?.phone ?? contact?.phoneNumber ?? '').trim();
}

function contactName(contact) {
  return String(contact?.name ?? contact?.title ?? '').trim();
}

function contactBalance(contact) {
  try {
    const value = Number(balanceOf(contact));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function contactWeeklySlot(contact) {
  return String(contact?.weeklySmsSentWeek ?? '').trim();
}

function contactWeeklyReminderEnabled(contact) {
  return contact?.weeklyReminderEnabled !== false;
}

function contactCrossingSlot(contact) {
  const sentAt =
    contact?.crossingSmsSentAt ??
    contact?.smsSentAt ??
    contact?.lastReminderSentAt ??
    contact?.reminderSentAt;
  if (!sentAt) return '';
  try {
    return String(weeklySlotForCrossingSentAt(sentAt) ?? '');
  } catch {
    return '';
  }
}

export default function WeeklyReminderSync() {
  const { contacts, setWeeklySmsSentWeek } = useContacts();
  const { settings } = useSettings();
  const enabled = Boolean(settings?.weeklySmsEnabled);
  const syncTimerRef = useRef(null);

  const persistWeeklyEvents = useCallback(
    (events) => {
      if (!Array.isArray(events)) return;
      events.forEach((event) => {
        const id = String(event?.contactId ?? event?.contact_id ?? '');
        const week = String(event?.week ?? event?.slot ?? '');
        if (id && week) setWeeklySmsSentWeek?.(id, week);
      });
    },
    [setWeeklySmsSentWeek],
  );

  const drainWeeklyEvents = useCallback(() => {
    if (Platform.OS !== 'android') return;
    try {
      const result = SmsReader.drainWeeklySmsEvents?.();
      if (!result) return;
      if (typeof result.then === 'function') {
        result.then(persistWeeklyEvents).catch(() => {});
        return;
      }
      persistWeeklyEvents(result);
    } catch {
      // Native module is absent in Expo Go; queued events are not expected there.
    }
  }, [persistWeeklyEvents]);

  const sync = useCallback(() => {
    if (Platform.OS !== 'android') return;
    drainWeeklyEvents();

    const cardNumber = String(settings?.cardNumber ?? '').trim();
    const settingsReady = Boolean(String(settings?.myName ?? '').trim() && cardNumber);
    const weekday = Number(settings?.weeklyWeekday ?? DEFAULT_WEEKLY_WEEKDAY);
    const hour = Number(settings?.weeklyHour ?? DEFAULT_WEEKLY_HOUR);
    const minute = Number(settings?.weeklyMinute ?? DEFAULT_WEEKLY_MINUTE);

    let currentSlot = '';
    try {
      currentSlot = String(weeklySlotFor(Date.now(), weekday, hour, minute) ?? '');
    } catch {
      currentSlot = '';
    }

    const list = Array.isArray(contacts) ? contacts : [];
    const snapshot = {
      enabled,
      threshold: WEEKLY_REMINDER_THRESHOLD,
      now: Date.now(),
      slot: currentSlot,
      settingsReady,
      cardNumber,
      weekday,
      hour,
      minute,
      contacts: list
        .map((contact) => {
          const id = contactId(contact);
          const name = contactName(contact);
          const phone = contactPhone(contact);
          const balance = contactBalance(contact);
          return {
            id,
            name,
            phone,
            balance,
            weeklySmsSentWeek: contactWeeklySlot(contact),
            crossingSmsSentWeek: contactCrossingSlot(contact),
            weeklyReminderEnabled: contactWeeklyReminderEnabled(contact),
            body: buildWeeklyReminder({
              customerName: name,
              amount: balance,
              cardNumber,
            }),
          };
        })
        .filter((item) => item.id && item.phone),
    };

    try {
      const configResult = SmsReader.setWeeklyReminderConfig?.({ enabled, weekday, hour, minute });
      if (configResult && typeof configResult.catch === 'function') {
        configResult.catch(() => {});
      }
    } catch {
      // Native module is absent in Expo Go; the disabled control is expected.
    }

    try {
      const syncResult = SmsReader.syncWeeklyReminder?.(snapshot);
      if (syncResult && typeof syncResult.catch === 'function') {
        syncResult.catch(() => {});
      }
    } catch {
      // Native module is absent in Expo Go; the disabled control is expected.
    }
  }, [contacts, enabled, drainWeeklyEvents, settings?.cardNumber, settings?.myName, settings?.weeklyWeekday, settings?.weeklyHour, settings?.weeklyMinute]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      sync();
    }, 50);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    };
  }, [sync]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const handleAppState = (nextState) => {
      if (nextState === 'active') sync();
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription?.remove?.();
  }, [sync]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    let subscription;
    try {
      subscription = SmsReader.addWeeklySmsSentListener?.((event) => {
        const id = String(event?.contactId ?? event?.contact_id ?? '');
        const week = String(event?.week ?? event?.slot ?? '');
        if (id && week) setWeeklySmsSentWeek?.(id, week);
      });
    } catch {
      subscription = null;
    }

    return () => subscription?.remove?.();
  }, [setWeeklySmsSentWeek]);

  return null;
}
