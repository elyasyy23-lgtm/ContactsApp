// Backup / restore / CSV export — pure logic, unit-tested in scripts/verify.js.
// The screens only handle files: they write the JSON/CSV string to cache and
// hand it to the system share sheet (the user saves it to Download or sends it
// anywhere), and read a picked file back for restore.

export const BACKUP_APP_ID = 'ekhata-backup';
export const BACKUP_VERSION = 1;

/** Serialize the whole ledger into a portable JSON string. */
export function buildBackup({ contacts, profiles, settings }) {
  const payload = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      contacts: Array.isArray(contacts) ? contacts.length : 0,
      transactions: Array.isArray(contacts)
        ? contacts.reduce((sum, c) => sum + (c.transactions?.length || 0), 0)
        : 0,
      profiles: Array.isArray(profiles) ? profiles.length : 0,
    },
    contacts: Array.isArray(contacts) ? contacts : [],
    profiles: Array.isArray(profiles) ? profiles : [],
    settings: settings || null,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Validate a picked backup file. Returns:
 *   { ok: false, reason: 'json'|'shape' }
 *   { ok: true, contacts, profiles, settings, counts }
 * Accepts both the full payload and a bare contacts array (legacy exports of
 * the raw @contacts_data), so nothing the user saved manually is useless.
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return { ok: false, reason: 'json' };
  }

  // Bare contacts array (legacy / raw storage dump).
  if (Array.isArray(parsed)) {
    return finalize(parsed, null, null);
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.contacts)) {
    return { ok: false, reason: 'shape' };
  }
  return finalize(parsed.contacts, parsed.profiles, parsed.settings);
}

function finalize(contacts, profiles, settings) {
  const clean = contacts.filter(
    (c) => c && typeof c === 'object' && String(c.name || '').trim().length > 0,
  );
  if (clean.length === 0 && contacts.length > 0) {
    return { ok: false, reason: 'shape' };
  }
  const okProfiles =
    Array.isArray(profiles) &&
    profiles.every((p) => p && typeof p === 'object' && String(p.name || '').trim());
  return {
    ok: true,
    contacts: clean,
    profiles: okProfiles ? profiles : null, // null = keep the current categories
    settings:
      settings && typeof settings === 'object'
        ? {
            myName: String(settings.myName || ''),
            cardNumber: String(settings.cardNumber || '').replace(/[^\d]/g, ''),
            shopName: String(settings.shopName || ''),
          }
        : null,
    counts: {
      contacts: clean.length,
      transactions: clean.reduce((sum, c) => sum + (c.transactions?.length || 0), 0),
    },
  };
}

/** Escape one CSV cell (quotes, commas, newlines). */
function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Customer table for Excel/Sheets: نام، شماره تماس، دسته، کل بدهی، کل دریافت، مانده
 * plus a totals row. Starts with a BOM so Excel reads the Persian headers as UTF-8.
 * Amounts are the literal ledger numbers (the same value the app shows).
 */
export function toCsv(contacts, profiles = []) {
  const profileName = (id) => {
    const p = profiles.find((x) => String(x.id) === String(id || ''));
    return p ? p.name : '';
  };

  const header = ['نام', 'شماره تماس', 'دسته', 'کل بدهی', 'کل دریافت', 'مانده'];
  const rows = contacts.map((c) => {
    const tx = Array.isArray(c.transactions) ? c.transactions : [];
    let credited = 0;
    let paid = 0;
    tx.forEach((t) => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'credit') credited += amount;
      else paid += amount;
    });
    return [
      csvCell(c.name),
      csvCell(c.phone || ''),
      csvCell(profileName(c.profileId)),
      String(credited),
      String(paid),
      String(credited - paid),
    ].join(',');
  });

  let totalCredited = 0;
  let totalPaid = 0;
  contacts.forEach((c) => {
    (Array.isArray(c.transactions) ? c.transactions : []).forEach((t) => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'credit') totalCredited += amount;
      else totalPaid += amount;
    });
  });
  const totals = [csvCell('جمع کل'), '', '', String(totalCredited), String(totalPaid), String(totalCredited - totalPaid)].join(',');

  return `\uFEFF${header.join(',')}\n${rows.join('\n')}${rows.length ? `\n${totals}` : ''}\n`;
}

/** File name for exports: ekhata-backup-2026-11-10.json (Latin, filesystem-safe). */
export function backupFileName(prefix, ext, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}.${ext}`;
}
