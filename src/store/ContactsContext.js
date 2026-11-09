// Single source of truth for customers + transactions.
// Everything reads from this context, so a payment recorded on the detail screen
// updates the home list balance instantly (no manual refresh, no local copies).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialOf, faLetterIndex } from '../utils/format';

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
    letter: c.letter || initialOf(name),
    createdAt: c.createdAt || null,
    transactions: Array.isArray(c.transactions)
      ? c.transactions.map(normalizeTransaction)
      : [],
  };
}

const ContactsContext = createContext(null);

export function ContactsProvider({ children }) {
  const [contacts, setContacts] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // Load once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setContacts(parsed.map(normalizeContact));
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
  }, []);

  // Persist after every change (skipping the initial empty render).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts)).catch((error) =>
      console.warn('Failed to save contacts', error),
    );
  }, [contacts, hydrated]);

  const addContact = useCallback((data) => {
    const contact = normalizeContact({
      ...data,
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      transactions: [],
    });
    setContacts((prev) => [contact, ...prev]);
    return contact;
  }, []);

  const updateContact = useCallback((id, data) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === id
          ? normalizeContact({
              ...c,
              ...data,
              letter: initialOf(data.name ?? c.name),
            })
          : c,
      ),
    );
  }, []);

  const deleteContact = useCallback((id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addTransaction = useCallback((contactId, data) => {
    const transaction = normalizeTransaction({
      ...data,
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? { ...c, transactions: [...c.transactions, transaction] }
          : c,
      ),
    );
    return transaction;
  }, []);

  const updateTransaction = useCallback((contactId, transactionId, data) => {
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== contactId) return c;
        return {
          ...c,
          transactions: c.transactions.map((t) =>
            t.id === transactionId
              ? normalizeTransaction({ ...t, ...data, id: t.id })
              : t,
          ),
        };
      }),
    );
  }, []);

  const deleteTransaction = useCallback((contactId, transactionId) => {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? {
              ...c,
              transactions: c.transactions.filter((t) => t.id !== transactionId),
            }
          : c,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      contacts,
      hydrated,
      addContact,
      updateContact,
      deleteContact,
      addTransaction,
      updateTransaction,
      deleteTransaction,
    }),
    [
      contacts,
      hydrated,
      addContact,
      updateContact,
      deleteContact,
      addTransaction,
      updateTransaction,
      deleteTransaction,
    ],
  );

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContacts must be used inside ContactsProvider');
  return ctx;
}

/** Live contact by id (re-renders when any transaction changes). */
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
