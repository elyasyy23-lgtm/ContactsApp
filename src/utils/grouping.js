// Persian alphabetical grouping for the customer lists.
// The Home screen already builds its letter chips dynamically; these helpers give
// every screen (profile view included) the same behaviour from one place.
import { faLetterIndex } from './format';

/** Distinct first letters present in the list, in Persian alphabet order. */
export function lettersOf(contacts = []) {
  const seen = [];
  contacts.forEach((contact) => {
    const letter = contact.letter || '?';
    if (!seen.includes(letter)) seen.push(letter);
  });
  return seen.sort((a, b) => faLetterIndex(a) - faLetterIndex(b));
}

/** [{ title: 'ب', data: [...] }, ...] sorted by the Persian alphabet. */
export function letterBuckets(contacts = []) {
  const buckets = new Map();
  contacts.forEach((contact) => {
    const letter = contact.letter || '?';
    if (!buckets.has(letter)) buckets.set(letter, []);
    buckets.get(letter).push(contact);
  });
  return [...buckets.entries()]
    .sort((a, b) => faLetterIndex(a[0]) - faLetterIndex(b[0]))
    .map(([title, data]) => ({ title, data }));
}
