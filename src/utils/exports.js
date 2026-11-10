// File export / import side of backup (needs native modules, so it lives
// separate from the pure utils/backup.js that Node tests can require).
// Writing straight into /storage/emulated/0/Download is not possible for a
// scoped-storage app: the file is written to the app cache and handed to the
// Android share sheet, where the user saves it to Download (or sends it via
// WhatsApp/Telegram/Drive — the file is self-contained JSON/CSV).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { backupFileName, buildBackup, toCsv } from './backup';

async function shareTextFile(name, content, mimeType, dialogTitle) {
  const file = new File(Paths.cache, name);
  file.writeSync(content);
  try {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
  } finally {
    // The receiver already read the content URI; drop the cache copy.
    try {
      file.delete();
    } catch {
      // already gone — nothing to clean
    }
  }
}

/** Export the full ledger as JSON. Returns { ok, name } or { ok: false }. */
export async function exportBackup({ contacts, profiles, settings }) {
  try {
    const name = backupFileName('eKhata-backup', 'json');
    await shareTextFile(
      name,
      buildBackup({ contacts, profiles, settings }),
      'application/json',
      'ذخیره فایل پشتیبان eKhata',
    );
    return { ok: true, name };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/** Export the customer table as CSV. Returns { ok, name } or { ok: false }. */
export async function exportCsv({ contacts, profiles }) {
  try {
    const name = backupFileName('eKhata-customers', 'csv');
    await shareTextFile(
      name,
      toCsv(contacts, profiles),
      'text/csv',
      'ذخیره فایل CSV مشتریان',
    );
    return { ok: true, name };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/**
 * Pick a backup JSON file with the system picker and return its text content.
 * Returns null when the user cancels or the file cannot be read.
 */
export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  try {
    return await new File(result.assets[0].uri).text();
  } catch {
    return null;
  }
}
