// Pure helpers for customer profiles (categories). No React / storage imports so
// scripts/verify.js can unit-test them in plain Node.

export const PROFILE_NAME_MAX = 24;

/** Trim, collapse inner spaces and cap the length. */
export function cleanProfileName(value) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, PROFILE_NAME_MAX);
}

/** Case/diacritic-loose key used only to block duplicate category names. */
export function profileNameKey(value) {
  return cleanProfileName(value).toLowerCase();
}

/**
 * True when another profile (id !== exceptId) already carries this name —
 * categories are unique so two «فروشگاه» rows can never exist.
 */
export function isDuplicateProfile(profiles, name, exceptId = null) {
  const key = profileNameKey(name);
  if (!key) return false;
  return (profiles || []).some(
    (profile) => profile.id !== exceptId && profileNameKey(profile.name) === key,
  );
}

/** { profileId: customerCount } — '' collects the customers with no category. */
export function profileCounts(contacts = []) {
  const counts = {};
  contacts.forEach((contact) => {
    const id = contact.profileId || '';
    counts[id] = (counts[id] || 0) + 1;
  });
  return counts;
}

/** Customers that belong to one profile ('' = بدون دسته). */
export function contactsOfProfile(contacts = [], profileId = '') {
  const id = profileId || '';
  return contacts.filter((contact) => (contact.profileId || '') === id);
}
