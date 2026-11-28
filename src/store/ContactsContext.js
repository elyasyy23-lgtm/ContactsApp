// Single source of truth for customers + transactions.
// Everything reads from this context, so a payment recorded on the detail screen
// updates the home list balance instantly (no manual refresh, no local copies).
//
// The store is kept in a ref (`contactsRef`) AND in state: mutations compute the
// next list synchronously from the ref, so the transaction save path can look at
// the NEW balance in the same tick and fire the automatic SMS reminder — no
// button, no screen effect, no waiting for a re-render.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialOf, faLetterIndex } from '../utils/format';
import { REMINDER_THRESHOLD } from '../utils/reminderGate';
import { autoSendReminder } from '../utils/reminderAuto';
import {
  WEEKLY_REMINDER_THRESHOLD,
  weeklySlotFor,
  weeklySlotForCrossingSentAt,
} from '../utils/weeklyReminder';
import { useSettings } from './SettingsContext';

const STORAGE_KEY = '@contacts_data';

export const TRANSACTION = { PAYMENT: 'payment', CREDIT: 'credit' };

/** Positive balance = the customer owes us money. */
export function balanceOf(contact) {
  if (!contact) return 0;
  return (contact.transactions || []).reduce((sum, t) => {
    const amount = Number(t.amount) || 0;
    return sum + (t.type === TRANSACTION.CREDIT ? amount : -amount);
  }, 0);
}

function normalizeTransaction(t, index) {
  return {
    id: t.id ? String(t.id) : `${Date.now()}-${index}`,
    type: t.type === TRANSACTION.CREDIT ? TRANSACTION.CREDIT : TRANSACTION.PAYMENT,
    // Amounts are stored exactly as the user typed them — never scaled.
    amount: String(t.amount ?? '0'),
    note: t.note || '',
    createdAt: t.createdAt || null,
    // Legacy records (v1 app) only carry pre-formatted date/time strings.
    date: t.date || '',
    time: t.time || '',
  };
}

function normalizeContact(c, index) {
  const name = String(c.name || '').trim();
  return {
    id: c.id ? String(c.id) : `${Date.now()}-${index}`,
    name,
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    // Last digits of the customer's card — used to match incoming bank SMS.
    cardNumber: c.cardNumber || '',
    // Customer category (see ProfilesContext). '' = بدون دسته.
    profileId: c.profileId || '',
    letter: c.letter || initialOf(name),
    createdAt: c.createdAt || null,
    // Anti-spam latch for the reminder: true = the SMS for the current
    // debt (balance above REMINDER_THRESHOLD) was already sent.
    // Reset to false as soon as the balance comes back under the threshold.
    smsSentForCurrentDebt: Boolean(c.smsSentForCurrentDebt),
    // Per-customer weekly Friday 10:00 SMS latch. `''` = this week's weekly
    // reminder has not been sent yet; a YYYY-MM-DD Friday slot key = sent.
    weeklySmsSentWeek: String(c.weeklySmsSentWeek || ''),
    // Per-customer reminder switch (Customer Form «ارسال پیامک یادآوری»).
    // Missing on old records → defaults to enabled.
    reminderEnabled: c.reminderEnabled === undefined ? true : Boolean(c.reminderEnabled),
    // Per-customer weekly scheduled reminder: STRICT opt-in. Missing, null,
    // undefined or any non-true value stays OFF (old/imported records included).
    // When OFF, the customer is excluded from the weekly scheduled reminder only.
    // Does NOT affect the existing threshold-crossing debt reminder.
    weeklyReminderEnabled: c.weeklyReminderEnabled === true,
    transactions: Array.isArray(c.transactions)
      ? c.transactions.map(normalizeTransaction)
      : [],
  };
}

const ContactsContext = createContext(null);

/**
 * Clears the automatic-reminder latch the moment the debt is back to/below the
 * threshold (customer paid), so the NEXT crossing can send exactly one more SMS.
 * Runs on every transaction change — including payments recorded automatically
 * from a bank SMS while the detail screen is closed.
 */
function settleReminderLatch(contact) {
  if (!contact.smsSentForCurrentDebt) return contact;
  if (balanceOf(contact) > REMINDER_THRESHOLD) return contact;
  return { ...contact, smsSentForCurrentDebt: false };
}

export function ContactsProvider({ children }) {
  const [contacts, setContacts] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // Mirror of `contacts` for synchronous reads inside mutations.
  const contactsRef = useRef(contacts);

  // Shop details (name + card) are needed to build the reminder text. Kept in a
  // ref so the callbacks below stay stable across settings edits.
  const { settings } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /** Single write path: ref first (synchronous), then React state. */
  const commit = useCallback((next) => {
    contactsRef.current = next;
    setContacts(next);
  }, []);

  // Load once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            commit(parsed.map(normalizeContact));
          }
        }
      } catch (error) {
        console.warn('Failed to load contacts', error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commit]);

  // Persist after every change (skipping the initial empty render).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)).catch((error) =>
      console.warn('Failed to save contacts', error),
    );
  }, [contacts, hydrated]);

  // Toggles the automatic-reminder latch. No-op when the value is unchanged.
  const setSmsSentForCurrentDebt = useCallback(
    (contactId, sent) => {
      const prev = contactsRef.current;
      const target = prev.find((c) => c.id === contactId);
      if (!target || Boolean(target.smsSentForCurrentDebt) === Boolean(sent)) {
        return;
      }
      commit(
        prev.map((c) =>
          c.id === contactId ? { ...c, smsSentForCurrentDebt: Boolean(sent) } : c,
        ),
      );
    },
    [commit],
  );

  // Mirrors the weekly latch back from the native scheduler. One slot per
  // customer; loading an older value from a different week is harmless because
  // weeklyReminderDecision() compares it with the current Friday slot.
  const setWeeklySmsSentWeek = useCallback(
    (contactId, week) => {
      const slot = String(week || '');
      if (!slot) return;
      const prev = contactsRef.current;
      const target = prev.find((c) => c.id === contactId);
      if (!target || String(target.weeklySmsSentWeek || '') === slot) return;
      commit(
        prev.map((c) =>
          c.id === contactId ? { ...c, weeklySmsSentWeek: slot } : c,
        ),
      );
    },
    [commit],
  );

  // A crossing SMS sent during the Friday 10:00 catch-up window already told the
  // customer about their debt, so do not follow it with the weekly message.
  const markWeeklySentIfCrossingWasDue = useCallback(
    (contactId) => {
      const week = weeklySlotForCrossingSentAt();
      if (week) setWeeklySmsSentWeek(contactId, week);
    },
    [setWeeklySmsSentWeek],
  );

  /**
   * The automatic reminder trigger. Called by every transaction mutation with
   * the contact AFTER the change; `raised` = the mutation increased the debt.
   * A payment (debt going down) must never produce a reminder SMS, so only a
   * rising debt is attempted — settleReminderLatch already handles the reset.
   * Fire-and-forget — the store never waits for the SMS, and a failure simply
   * leaves the latch untouched (next attempt retries).
   */
  const fireAutoReminder = useCallback(
    (contact, raised) => {
      if (!contact || !raised) return;
      autoSendReminder({
        contact,
        balance: balanceOf(contact),
        settings: settingsRef.current,
        setSmsSentForCurrentDebt,
      })
        .then((result) => {
          if (result && result.ok) markWeeklySentIfCrossingWasDue(contact.id);
        })
        .catch((error) => console.warn('Automatic reminder failed', error));
    },
    [markWeeklySentIfCrossingWasDue, setSmsSentForCurrentDebt],
  );

  /**
   * Recovery trigger for a debt that crossed while sending was impossible
   * (shop details not filled yet, SEND_SMS denied, app updated with existing
   * debts). A customer screen calls it when it shows such a debt; the
   * once-per-debt latch + in-flight guard keep it idempotent, so calling it on
   * every focus sends at most one SMS per debt crossing.
   */
  const attemptAutoReminder = useCallback(
    (contactId) => {
      const contact = contactsRef.current.find((c) => c.id === contactId);
      if (!contact) return;
      autoSendReminder({
        contact,
        balance: balanceOf(contact),
        settings: settingsRef.current,
        setSmsSentForCurrentDebt,
      })
        .then((result) => {
          if (result && result.ok) markWeeklySentIfCrossingWasDue(contact.id);
        })
        .catch((error) => console.warn('Automatic reminder failed', error));
    },
    [markWeeklySentIfCrossingWasDue, setSmsSentForCurrentDebt],
  );

  const addContact = useCallback(
    (data) => {
      const contact = normalizeContact({
        ...data,
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        transactions: [],
      });
      commit([contact, ...contactsRef.current]);
      return contact;
    },
    [commit],
  );

  const updateContact = useCallback(
    (id, data) => {
      commit(
        contactsRef.current.map((c) =>
          c.id === id
            ? normalizeContact({
                ...c,
                ...data,
                letter: initialOf(data.name ?? c.name),
              })
            : c,
        ),
      );
    },
    [commit],
  );

  const deleteContact = useCallback(
    (id) => {
      commit(contactsRef.current.filter((c) => c.id !== id));
    },
    [commit],
  );

  /**
   * Bulk replace (backup restore / clear-all). Every row goes through
   * normalizeContact, so a restored file can never poison the store shape.
   * Returns the number of contacts actually imported.
   */
  const importContacts = useCallback(
    (list) => {
      const rows = Array.isArray(list) ? list : [];
      commit(rows.map(normalizeContact));
      return rows.length;
    },
    [commit],
  );

  /**
   * Save a transaction — THE automatic-reminder trigger point.
   * The new balance is known synchronously here, so the moment a credit pushes
   * the debt above REMINDER_THRESHOLD the silent SMS goes out by itself.
   * `raised` is what makes it a crossing: a payment lowers the debt and must
   * never send a reminder.
   */
  const addTransaction = useCallback(
    (contactId, data) => {
      const transaction = normalizeTransaction({
        ...data,
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
      const prev = contactsRef.current;
      const target = prev.find((c) => c.id === contactId);
      if (!target) return transaction;

      const before = balanceOf(target);
      const updated = settleReminderLatch({
        ...target,
        transactions: [...target.transactions, transaction],
      });
      commit(prev.map((c) => (c.id === contactId ? updated : c)));
      fireAutoReminder(updated, balanceOf(updated) > before);
      return transaction;
    },
    [commit, fireAutoReminder],
  );

  const updateTransaction = useCallback(
    (contactId, transactionId, data) => {
      const prev = contactsRef.current;
      const target = prev.find((c) => c.id === contactId);
      if (!target) return;

      const before = balanceOf(target);
      const updated = settleReminderLatch({
        ...target,
        transactions: target.transactions.map((t) =>
          t.id === transactionId
            ? normalizeTransaction({ ...t, ...data, id: t.id })
            : t,
        ),
      });
      commit(prev.map((c) => (c.id === contactId ? updated : c)));
      fireAutoReminder(updated, balanceOf(updated) > before);
    },
    [commit, fireAutoReminder],
  );

  const deleteTransaction = useCallback(
    (contactId, transactionId) => {
      const prev = contactsRef.current;
      const target = prev.find((c) => c.id === contactId);
      if (!target) return;

      const before = balanceOf(target);
      const updated = settleReminderLatch({
        ...target,
        transactions: target.transactions.filter((t) => t.id !== transactionId),
      });
      commit(prev.map((c) => (c.id === contactId ? updated : c)));
      fireAutoReminder(updated, balanceOf(updated) > before);
    },
    [commit, fireAutoReminder],
  );

  // A deleted category must not leave dangling ids behind.
  const clearProfileFromContacts = useCallback(
    (profileId) => {
      commit(
        contactsRef.current.map((c) =>
          c.profileId === profileId ? { ...c, profileId: '' } : c,
        ),
      );
    },
    [commit],
  );

  const value = useMemo(
    () => ({
      contacts,
      hydrated,
      addContact,
      updateContact,
      deleteContact,
      importContacts,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      attemptAutoReminder,
      setSmsSentForCurrentDebt,
      setWeeklySmsSentWeek,
      clearProfileFromContacts,
    }),
    [
      contacts,
      hydrated,
      addContact,
      updateContact,
      deleteContact,
      importContacts,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      attemptAutoReminder,
      setSmsSentForCurrentDebt,
      setWeeklySmsSentWeek,
      clearProfileFromContacts,
    ],
  );

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContacts must be used inside ContactsProvider');
  return ctx;
}

export function useContact(id) {
  const { contacts } = useContacts();
  return useMemo(() => contacts.find((c) => c.id === id) || null, [contacts, id]);
}

/** Sorted for display: Persian alphabet order, then name. */
export function sortContacts(list) {
  return [...list].sort((a, b) => {
    const diff = faLetterIndex(a.letter) - faLetterIndex(b.letter);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'fa');
  });
}

export function totalsOf(contacts) {
  let receivable = 0; // customers owe us
  let payable = 0; // we owe customers
  contacts.forEach((c) => {
    const b = balanceOf(c);
    if (b > 0) receivable += b;
    else if (b < 0) payable += Math.abs(b);
  });
  return { receivable, payable, count: contacts.length };
}
