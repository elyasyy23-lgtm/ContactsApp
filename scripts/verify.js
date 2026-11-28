#!/usr/bin/env node
/**
 * Offline verification for this Expo app (no device, no Metro needed).
 *
 *   node scripts/verify.js
 *
 * 1. Babel-parses every JS/JSX source file with `babel-preset-expo`.
 * 2. Audits unbound identifiers per module (catches a missing import before the
 *    app crashes on the phone — e.g. calling `toFa` without importing it).
 * 3. Runs the pure-logic unit checks: money formatting (Persian digits + Toman),
 *    amount parsing, the bank-SMS parser and the exact reminder template.
 *
 * Metro bundling is the final gate: `curl http://127.0.0.1:8081/index.bundle?platform=android`
 * must return HTTP 200 (a JSON body means a real bundling error).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const babel = require(path.join(ROOT, 'node_modules/@babel/core'));
const traverse = require(path.join(ROOT, 'node_modules/@babel/traverse')).default;
const cjsPlugin = require(path.join(ROOT, 'node_modules/@babel/plugin-transform-modules-commonjs'));
const presetExpo = require.resolve('babel-preset-expo', { paths: [ROOT] });

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

const sources = [
  'App.js',
  'index.js',
  ...walk(path.join(ROOT, 'modules')),
  ...walk(path.join(ROOT, 'src')),
].map((f) => path.resolve(ROOT, f));

// ── 1. parse ───────────────────────────────────────────────────────────────
let failures = 0;
for (const file of sources) {
  try {
    babel.transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      presets: [presetExpo],
      babelrc: false,
      configFile: false,
    });
  } catch (error) {
    failures++;
    console.error(`PARSE FAIL ${path.relative(ROOT, file)}\n  ${error.message.split('\n')[0]}`);
  }
}
console.log(`parse: ${sources.length - failures}/${sources.length} files ok`);

// ── 2. unbound identifiers ─────────────────────────────────────────────────
const JS_GLOBALS = new Set([
  'require', 'module', 'exports', 'console', 'global', 'process', '__DEV__',
  'undefined', 'NaN', 'Infinity', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'fetch', 'Promise', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Math', 'Date', 'JSON', 'Error', 'Map', 'Set', 'Symbol', 'parseInt',
  'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'URL',
  'Uint8Array', 'TextEncoder', 'TextDecoder', 'RegExp', 'Intl', 'AbortController',
]);
for (const file of sources) {
  const ast = babel.parseSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: [presetExpo],
    babelrc: false,
    configFile: false,
  });
  const unbound = new Set();
  traverse(ast, {
    Program(p) {
      Object.keys(p.scope.globals).forEach((name) => {
        if (!JS_GLOBALS.has(name)) unbound.add(name);
      });
    },
  });
  if (unbound.size) {
    failures++;
    console.error(`UNBOUND ${path.relative(ROOT, file)} -> ${[...unbound].join(', ')}`);
  }
}
console.log('unbound identifiers: checked');

// ── 3. pure-logic unit checks ──────────────────────────────────────────────
// Compile the ESM sources on the fly so plain `require` can load them here.
const srcDir = path.join(ROOT, 'src');
const cctvModuleDir = path.join(ROOT, 'modules/cctv-playback');
const originalJsLoader = Module._extensions['.js'];
Module._extensions['.js'] = function (module, filename) {
  if (filename.startsWith(srcDir)) {
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      plugins: [cjsPlugin],
      babelrc: false,
      configFile: false,
    }).code;
    return module._compile(code, filename);
  }
  return originalJsLoader(module, filename);
};

const fmt = require(path.join(srcDir, 'utils/format.js'));
const sms = require(path.join(srcDir, 'utils/smsParser.js'));
const matcher = require(path.join(srcDir, 'utils/smsMatch.js'));
const gate = require(path.join(srcDir, 'utils/reminderGate.js'));
const trial = require(path.join(srcDir, 'utils/trial.js'));
const profileUtils = require(path.join(srcDir, 'utils/profiles.js'));
const grouping = require(path.join(srcDir, 'utils/grouping.js'));
const calc = require(path.join(srcDir, 'utils/calc.js'));
const backup = require(path.join(srcDir, 'utils/backup.js'));
const reminderUi = require(path.join(srcDir, 'utils/reminderUi.js'));
const buildInfo = require(path.join(srcDir, 'buildInfo.js'));
const updateCheck = require(path.join(srcDir, 'utils/updateCheck.js'));
const rtsp = require(path.join(srcDir, 'utils/rtsp.js'));
const tvPlayback = require(path.join(srcDir, 'utils/tvPlayback.js'));
const weeklyReminder = require(path.join(srcDir, 'utils/weeklyReminder.js'));

try {
  assert.strictEqual(fmt.group(1234567), '1,234,567', 'group() stays Latin');
  assert.strictEqual(fmt.money(1234567), '۱٬۲۳۴٬۵۶۷', 'money() is Persian + ٬');
  assert.strictEqual(fmt.toFa('2026'), '۲۰۲۶');
  assert.strictEqual(fmt.toEn('۲۰۲۶'), '2026');
  assert.strictEqual(fmt.parseAmount('۱٬۲۵۰٬۰۰۰'), 1250000);
  assert.strictEqual(fmt.parseAmount('1,250,000'), 1250000);
  assert.strictEqual(fmt.groupCard('6037997412345678'), '6037 9974 1234 5678');

  // ── language switch: digits AND calendar follow the locale ───────────────
  const sample = new Date(2026, 10, 2, 14, 5, 0); // 2026-11-02 14:05
  assert.strictEqual(fmt.getLocale(), 'fa', 'default locale is Persian');
  assert.strictEqual(fmt.digits(1405), '۱۴۰۵');
  assert.strictEqual(fmt.jalaliDate(sample), '۱۴۰۵/۰۸/۱۱', 'fa date is Jalali');
  assert.strictEqual(fmt.clockTime(sample), '۱۴:۰۵');
  assert.strictEqual(fmt.money(1234567), '۱٬۲۳۴٬۵۶۷');
  fmt.setLocale('en');
  assert.strictEqual(fmt.digits(1405), '1405');
  assert.strictEqual(fmt.jalaliDate(sample), '2026/11/02', 'en date is Gregorian');
  assert.strictEqual(fmt.clockTime(sample), '14:05');
  assert.strictEqual(fmt.money(1234567), '1,234,567');
  assert.strictEqual(fmt.dateTime(sample.getTime()).date, '2026/11/02');
  fmt.setLocale('fa');
  assert.strictEqual(fmt.jalaliDate(sample), '۱۴۰۵/۰۸/۱۱', 'switching back restores Jalali');
  assert.strictEqual(fmt.dateTime(sample.getTime()).date, '۱۴۰۵/۰۸/۱۱');

  // ── money() must print the full value, never a shortened one ─────────────
  assert.strictEqual(fmt.money(308000), '۳۰۸٬۰۰۰', 'money() shows every digit');
  assert.strictEqual(fmt.money(308), '۳۰۸', 'money() never invents thousands');

  // ── amounts are stored verbatim: no scaling of small numbers ─────────────
  assert.strictEqual(fmt.parseAmount('308'), 308, 'typed 308 stays 308');
  assert.strictEqual(fmt.parseAmount('۳۰۸'), 308);
  assert.strictEqual(fmt.money(fmt.parseAmount('308')), '۳۰۸');
  assert.strictEqual(typeof fmt.applyAmountRule, 'undefined', 'the ×1000 rule is gone');

  // SMS amounts land on the same ledger unit the shop types by hand:
  // Rial ÷ 10 = Toman, then ÷ 1,000 = the number shown in the app.
  const rial = sms.parseBankSms('مبلغ 12,500,000 ریال واریز به حساب شما، کارت *1234، بانک ملت');
  assert.strictEqual(rial.ok, true);
  assert.strictEqual(rial.amount, 1250, '12,500,000 Rial → 1,250 units (1,250,000 Toman)');
  assert.strictEqual(rial.tomanAmount, 1250000, 'plain Toman value also reported');
  assert.strictEqual(rial.bank, 'ملت');
  assert.strictEqual(rial.card, '1234');

  const rialRule = sms.parseBankSms('مبلغ ۱٬۹۰۰٬۰۰۰ ریال واریز به حساب شما، بانک ملت');
  assert.strictEqual(rialRule.amount, 190, '1,900,000 Rial → 190,000 Toman → 190, like typing 190');

  const smallRial = sms.parseBankSms('مبلغ 9,000 ریال واریز شد، بانک ملت');
  assert.strictEqual(smallRial.amount, 1, '900 Toman rounds to 1 unit');

  const toman = sms.parseBankSms('برداشت 250,000 تومان از حساب شما');
  assert.strictEqual(toman.amount, 250);
  assert.strictEqual(toman.tomanAmount, 250000);
  assert.strictEqual(toman.direction, 'out');

  const reminder = sms.buildReminder({
    customerName: 'علی رضایی',
    amount: 1250, // ledger units → 1,250,000 Toman for the customer
    cardNumber: '6037997412345678',
    myName: 'محمد احمدی',
  });
  const expected = [
    'علی رضایی عزیز،',
    'یادآوری می‌شود موجودی بدهی شما ۱٬۲۵۰٬۰۰۰ تومان می‌باشد.',
    'جهت تسویه، لطفاً مبلغ را به شماره کارت زیر واریز نمایید:',
    '6037 9974 1234 5678',
    'به نام: محمد احمدی',
    'لطفاً پس از واریز، تصویر رسید تراکنش را برای این شماره ارسال نمایید.',
    'با تشکر از همکاری شما',
  ].join('\n');
  assert.strictEqual(reminder, expected, 'reminder template must stay verbatim');
  assert.ok(!/ابقففل/.test(reminder), 'no leftover placeholder in the reminder');
  assert.ok(reminder.includes('به نام: محمد احمدی'), 'sender name comes from settings');

  // ── 7-day trial: starts on first launch, locks after 7 days ──────────────
  const T0 = 1700000000000;
  assert.strictEqual(trial.TRIAL_DAYS, 7);
  assert.strictEqual(trial.TRIAL_MS, 7 * trial.DAY_MS);

  const notStarted = trial.trialInfo(0, T0);
  assert.strictEqual(notStarted.started, false, 'no recorded start → not started yet');
  assert.strictEqual(notStarted.active, false);

  const fresh = trial.trialInfo(T0, T0);
  assert.strictEqual(fresh.active, true, 'first launch → trial active');
  assert.strictEqual(fresh.daysLeft, 7, 'day one shows 7 days left');
  assert.strictEqual(fresh.endsAt, T0 + trial.TRIAL_MS);

  const day6 = trial.trialInfo(T0, T0 + 6 * trial.DAY_MS + 3600000);
  assert.strictEqual(day6.active, true);
  assert.strictEqual(day6.daysLeft, 1, 'a partial last day still counts as 1');

  const exactEnd = trial.trialInfo(T0, T0 + trial.TRIAL_MS);
  assert.strictEqual(exactEnd.active, false, 'exactly 7 days → trial over');
  assert.strictEqual(exactEnd.expired, true);
  assert.strictEqual(exactEnd.daysLeft, 0);

  assert.strictEqual(trial.trialInfo(T0, T0 + 30 * trial.DAY_MS).expired, true, 'stays over');

  const clockBack = trial.trialInfo(T0, T0 - 3 * trial.DAY_MS);
  assert.strictEqual(clockBack.daysLeft, 7, 'a backwards clock cannot extend the trial');

  const seenClamp = trial.trialInfo(T0, Math.max(T0 - 3 * trial.DAY_MS, T0 + trial.TRIAL_MS));
  assert.strictEqual(seenClamp.expired, true, 'max(now, lastSeenAt) keeps it expired');

  // ── SMS → customer matching (auto payment recording) ────────────────────
  const customers = [
    { id: '1', name: 'علی رضایی', cardNumber: '6037997412345678' },
    { id: '2', name: 'مریم کریمی', cardNumber: '' },
    { id: '3', name: 'رضا محمدی', cardNumber: '' },
  ];

  const byCard = matcher.matchSms(
    {
      id: 'a',
      address: 'BankMellat',
      timestamp: 1,
      body: 'واریز 500,000 تومان به حساب شما، کارت *5678، بانک ملت',
    },
    customers,
  );
  assert.strictEqual(byCard.confidence, 'high', 'card last-4 → high confidence');
  assert.strictEqual(byCard.match.id, '1');

  const byName = matcher.matchSms(
    {
      id: 'b',
      address: 'BankSaman',
      timestamp: 2,
      body: 'مبلغ 250,000 تومان واریز شد. از: مريم كريمي — بانک سامان',
    },
    customers,
  );
  assert.strictEqual(byName.confidence, 'high', 'full name (ي/ك variants) → high');
  assert.strictEqual(byName.match.id, '2');

  const outgoing = matcher.matchSms(
    { id: 'c', address: 'BankMellat', timestamp: 3, body: 'برداشت 90,000 تومان از حساب شما، بانک ملت' },
    customers,
  );
  assert.strictEqual(outgoing.confidence, 'none');
  assert.strictEqual(outgoing.reason, 'outgoing');

  const unmatched = matcher.matchSms(
    { id: 'd', address: 'BankMelli', timestamp: 4, body: 'واریز 700,000 تومان، بانک ملی' },
    customers,
  );
  assert.strictEqual(unmatched.match, null);
  assert.strictEqual(unmatched.reason, 'unmatched');

  const partial = matcher.matchSms(
    { id: 'e', address: 'BankMelli', timestamp: 5, body: 'واریز 80,000 تومان از محمدی، بانک ملی' },
    customers,
  );
  assert.strictEqual(partial.confidence, 'low', 'single name word → needs confirmation');
  assert.strictEqual(partial.match.id, '3');

  const keyA = matcher.smsKey({ address: 'BankMellat', timestamp: 9, body: 'مبلغ ۱۰۰۰ تومان' });
  const keyB = matcher.smsKey({ address: 'BankMellat', timestamp: 9, body: 'مبلغ 1000 تومان' });
  assert.strictEqual(keyA, keyB, 'dedupe key normalizes Persian digits');

  // The shop's own card must never be mistaken for the customer's card.
  const shopOwnCard = matcher.matchSms(
    { id: 'f', address: 'BankMellat', timestamp: 6, body: 'واریز 900,000 تومان به کارت *5678، بانک ملت' },
    customers,
    { ignoreCardLast4: '5678' },
  );
  assert.strictEqual(shopOwnCard.match, null, 'own receiving card is ignored');
  assert.strictEqual(shopOwnCard.reason, 'unmatched');

  const persianCard = matcher.matchSms(
    { id: 'g', address: 'BankMellat', timestamp: 7, body: 'واریز ۱۲۰,۰۰۰ تومان، کارت *۵۶۷۸، بانک ملت' },
    [{ id: '4', name: 'سارا نادری', cardNumber: '۶۰۳۷۹۹۷۴۱۲۳۴۵۶۷۸' }],
  );
  assert.strictEqual(persianCard.match.id, '4', 'Persian-digit card numbers match');

  // ── a deposit SMS from Hanieh lands on Hanieh as a payment ──────────────
  const hanieh = matcher.matchSms(
    {
      id: 'h',
      address: 'BankMellat',
      timestamp: 8,
      body: 'واریز ۱٬۹۰۰٬۰۰۰ ریال به حساب شما، از هانیه، بانک ملت',
    },
    [{ id: '5', name: 'هانیه', cardNumber: '' }],
  );
  assert.strictEqual(hanieh.confidence, 'high', 'full name in the SMS → high confidence');
  assert.strictEqual(hanieh.match && hanieh.match.id, '5', 'attributed to Hanieh');
  assert.strictEqual(hanieh.parsed.amount, 190, 'the 190 amount is what Hanieh pays');

  const taMarbuta = matcher.matchSms(
    { id: 'h2', address: 'BankMellat', timestamp: 9, body: 'واریز ۵۰۰,۰۰۰ ریال، هانیة، بانک ملت' },
    [{ id: '5', name: 'هانیه', cardNumber: '' }],
  );
  assert.strictEqual(taMarbuta.match && taMarbuta.match.id, '5', 'ة/ه spelling still matches');

  // ── manual sender exclusion (owner-configurable ignore list) ────────────
  assert.strictEqual(sms.isExcludedSender('09123456789', ['09123456789']), true, 'exact number excluded');
  assert.strictEqual(sms.isExcludedSender('+989123456789', ['09123456789']), true, 'country code ignored');
  assert.strictEqual(sms.isExcludedSender('989123456789', ['0912 345 6789']), true, 'spaces ignored');
  assert.strictEqual(sms.isExcludedSender('09123456789', ['09123456780']), false, 'a different number is not excluded');
  assert.strictEqual(sms.isExcludedSender('2000', ['2000']), true, 'a bank short code matches exactly');
  assert.strictEqual(sms.isExcludedSender('20001', ['2000']), false, 'short codes are not prefix-matched');
  assert.strictEqual(sms.isExcludedSender('BankMellat', ['09123456789']), false, 'an alpha sender is not a number');
  assert.strictEqual(sms.isExcludedSender('09123456789', []), false, 'empty list excludes nothing (default)');
  assert.strictEqual(sms.isExcludedSender('09123456789', null), false, 'a missing list is safe');

  // the v13 official-sender gate was reversed by the owner: only the manual list filters
  const inboxSrc = fs.readFileSync(path.join(srcDir, 'store/SmsInboxContext.js'), 'utf8');
  assert.ok(!inboxSrc.includes('isOfficialBankSender'), 'the official-sender gate is gone');
  assert.ok(inboxSrc.includes('isExcludedSender'), 'the manual exclusion filter is wired into the scan');
  assert.ok(
    !fs.readFileSync(path.join(srcDir, 'utils/smsParser.js'), 'utf8').includes('isOfficialBankSender'),
    'no official-sender helper remains in smsParser',
  );

  // ── automatic reminder gate: once per debt, reset on payment ─────────────
  const ready = { settingsReady: true, hasPhone: true };
  assert.strictEqual(gate.REMINDER_THRESHOLD, 1000, 'threshold is in ledger units');
  assert.strictEqual(gate.TOMAN_PER_UNIT, 1000);
  assert.strictEqual(
    gate.reminderAction({ balance: 1001, sentForCurrentDebt: false, ...ready }),
    'send',
    'just above 1,000 units (1,000,000 Toman) → send',
  );
  assert.strictEqual(
    gate.reminderAction({ balance: 5000, sentForCurrentDebt: true, ...ready }),
    'none',
    'no repeat while the debt stays above the threshold',
  );
  assert.strictEqual(
    gate.reminderAction({ balance: 500, sentForCurrentDebt: true, ...ready }),
    'reset',
    'paying below the threshold clears the latch',
  );
  assert.strictEqual(
    gate.reminderAction({ balance: 1000, sentForCurrentDebt: true, ...ready }),
    'reset',
    'exactly 1,000 units counts as "not above"',
  );
  assert.strictEqual(
    gate.reminderAction({ balance: 2000, sentForCurrentDebt: false, settingsReady: false, hasPhone: true }),
    'none',
    'missing shop details → no send and no latch',
  );
  assert.strictEqual(
    gate.reminderAction({ balance: 2000, sentForCurrentDebt: false, settingsReady: true, hasPhone: false }),
    'none',
    'missing phone → no send and no latch',
  );

  // Full lifecycle: high → high → paid → high again → high.
  let latched = false;
  const step = (balance) => {
    const action = gate.reminderAction({ balance, sentForCurrentDebt: latched, ...ready });
    if (action === 'send') latched = true;
    if (action === 'reset') latched = false;
    return action;
  };
  assert.strictEqual(step(1200), 'send', '1st crossing → one SMS');
  assert.strictEqual(step(1500), 'none', 'still above → silent');
  assert.strictEqual(step(3300), 'none', 'more debt, same crossing → silent');
  assert.strictEqual(step(0), 'reset', 'customer pays → latch cleared');
  assert.strictEqual(step(1500), 'send', 'new debt → exactly one more SMS');
  assert.strictEqual(step(1900), 'none', 'and silent afterwards');

  // ── automatic reminder is wired into the transaction save path ───────────
  // Static guard: the trigger must live inside ContactsContext's transaction
  // mutations (no button, no screen effect). A refactor that drops it silently
  // breaks the whole feature, so it is asserted here.
  const storeSrc = fs.readFileSync(path.join(srcDir, 'store/ContactsContext.js'), 'utf8');
  assert.ok(
    storeSrc.includes("from '../utils/reminderAuto'"),
    'ContactsContext imports the automatic sender',
  );
  const fireCalls = (
    storeSrc.match(/fireAutoReminder\(updated, balanceOf\(updated\) > before\)/g) || []
  ).length;
  assert.strictEqual(
    fireCalls,
    3,
    'add / update / delete transaction each fire the automatic reminder',
  );
  assert.ok(
    /const addTransaction[\s\S]{0,1500}fireAutoReminder\(updated, balanceOf\(updated\) > before\)/.test(
      storeSrc,
    ),
    'the trigger sits inside addTransaction (the transaction save path)',
  );
  assert.ok(
    /const fireAutoReminder[\s\S]{0,400}if \(!contact \|\| !raised\) return;/.test(storeSrc),
    'a payment (debt going down) never produces a reminder SMS',
  );
  assert.ok(
    storeSrc.includes('const attemptAutoReminder') && /attemptAutoReminder,/.test(storeSrc),
    'recovery path exists and is exposed (debts that crossed while sending was impossible)',
  );

  const autoSrc = fs.readFileSync(path.join(srcDir, 'utils/reminderAuto.js'), 'utf8');
  assert.ok(
    autoSrc.includes('sendSilently') && autoSrc.includes('setSmsSentForCurrentDebt'),
    'automatic sender sends silently and latches only on success',
  );
  assert.ok(
    !autoSrc.includes('Alert') && !autoSrc.includes('Linking'),
    'automatic sender never opens a UI (no Alert / no composer)',
  );
  assert.ok(
    autoSrc.includes('reminderEnabled !== false'),
    'a customer with the reminder switch off gets no automatic SMS',
  );
  assert.ok(
    !autoSrc.includes('PermissionsAndroid') &&
      /requestPermission = false/.test(autoSrc),
    'the automatic path never opens the Android permission dialog',
  );

  // ── reminder UI: the manual button exists ONLY as a fallback ─────────────
  const readyUi = {
    balance: 2000,
    sentForCurrentDebt: false,
    reminderEnabled: true,
    settingsReady: true,
    hasPhone: true,
    silentAvailable: true,
    permissionGranted: true,
  };
  const uiOf = (patch) => reminderUi.reminderUiState({ ...readyUi, ...patch });
  const Ui = reminderUi.REMINDER_UI;
  assert.strictEqual(uiOf({}).mode, Ui.ARMED, 'fully capable → automatic owns it');
  assert.strictEqual(uiOf({}).canAuto, true);
  assert.strictEqual(uiOf({ sentForCurrentDebt: true }).mode, Ui.SENT, 'already sent → receipt, no button');
  assert.strictEqual(uiOf({ balance: 1000 }).mode, Ui.BELOW, 'exactly 1,000 → below');
  assert.strictEqual(uiOf({ balance: 0 }).mode, Ui.BELOW);
  assert.strictEqual(uiOf({ reminderEnabled: false }).mode, Ui.OFF, 'customer switch off');
  assert.strictEqual(uiOf({ settingsReady: false }).mode, Ui.SETTINGS, 'shop details missing');
  assert.strictEqual(uiOf({ hasPhone: false }).mode, Ui.PHONE, 'no phone → fallback');
  assert.strictEqual(uiOf({ silentAvailable: false }).mode, Ui.UNAVAILABLE, 'Expo Go → composer fallback');
  assert.strictEqual(uiOf({ permissionGranted: false }).mode, Ui.PERMISSION, 'SEND_SMS denied → one-tap fix');
  assert.strictEqual(uiOf({ permissionGranted: false }).canAuto, false);
  assert.strictEqual(reminderUi.isAutoOwned(Ui.ARMED), true);
  assert.strictEqual(reminderUi.isAutoOwned(Ui.SENT), true);
  assert.strictEqual(reminderUi.isAutoOwned(Ui.PERMISSION), false);

  // Static guard: the detail screen must not render a generic send button when
  // the automatic sender is armed — that was the reported bug.
  const detailSrc = fs.readFileSync(path.join(srcDir, 'screens/CustomerDetailScreen.js'), 'utf8');
  assert.ok(
    !detailSrc.includes("'ارسال یادآوری'"),
    'no unconditional «ارسال یادآوری» button on the customer screen',
  );
  assert.ok(
    detailSrc.includes('reminderUi.mode === REMINDER_UI.PERMISSION'),
    'the fallback button is tied to the actual blocker',
  );
  assert.ok(
    /useEffect\(\(\) => \{\s*if \(!autoArmed \|\| !contact\) return;\s*attemptAutoReminder\(contact\.id\);/.test(
      detailSrc,
    ),
    'the screen recovers a debt that crossed while sending was impossible',
  );

  // ── build identity: v9 and v10 shipped as the same "1.2.0" ───────────────
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  assert.strictEqual(
    buildInfo.APP_VERSION,
    appJson.expo.version,
    'in-app version comes from app.json',
  );
  assert.strictEqual(
    buildInfo.BUILD_NUMBER,
    appJson.expo.android.versionCode,
    'build number mirrors android.versionCode',
  );
  assert.ok(
    Number(appJson.expo.android.versionCode) >= 10,
    'versionCode advanced past the v9/v10 collision (both were 1.2.0)',
  );
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8');
  assert.ok(
    workflow.includes('HesabYar-v${V}-${C}.apk'),
    'the CI APK is named with version + versionCode',
  );

  // ── in-app update checker (version.json on the website) ──────────────────
  assert.deepStrictEqual(updateCheck.parseVersion('1.5.0'), [1, 5, 0]);
  assert.deepStrictEqual(updateCheck.parseVersion(''), []);
  assert.deepStrictEqual(updateCheck.parseVersion('abc'), []);
  assert.strictEqual(updateCheck.isNewer('1.5.0', '1.4.0'), true, 'a newer version is detected');
  assert.strictEqual(updateCheck.isNewer('1.5.0', '1.5.0'), false, 'same version is not an update');
  assert.strictEqual(updateCheck.isNewer('1.4.0', '1.5.0'), false, 'older is never an update');
  assert.strictEqual(updateCheck.isNewer('1.10.0', '1.9.0'), true, 'numeric compare, not string');
  assert.strictEqual(updateCheck.isNewer('2.0', '1.9.9'), true, 'missing parts count as 0');
  assert.strictEqual(updateCheck.isNewer('1.5', '1.5.0'), false, '1.5 equals 1.5.0');
  assert.strictEqual(updateCheck.isNewer('', '1.0.0'), false, 'an empty remote is safe');
  assert.strictEqual(updateCheck.isNewer('1.5.0', ''), false, 'an empty local is safe');
  assert.ok(/^https:\/\//.test(updateCheck.UPDATE_MANIFEST_URL), 'the manifest URL is https');
  assert.ok(
    fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8').includes('<UpdateNotice />'),
    'the update notice is mounted in App.js',
  );

  // ── CCTV archive playback (v1.6 WIP) ──────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, '0');
  const localStamp = (v) => {
    const d = new Date(v);
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(
      d.getMinutes(),
    )}${pad2(d.getSeconds())}`;
  };
  const dahuaStamp = (v) => {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(localStamp(v));
    return `${m[1]}_${m[2]}_${m[3]}_${m[4]}_${m[5]}_${m[6]}`;
  };
  assert.strictEqual(rtsp.DEFAULT_ARCHIVE_LEAD_MINUTES, 5, 'archive starts 5 minutes early');
  assert.strictEqual(
    rtsp.DEFAULT_ARCHIVE_TAIL_MINUTES,
    5,
    'archive ends 5 minutes after the transaction',
  );
  assert.strictEqual(rtsp.DEFAULT_ARCHIVE_DURATION_MINUTES, 10, 'archive duration is configurable');
  assert.strictEqual(
    rtsp.DEFAULT_ARCHIVE_DURATION_MINUTES,
    rtsp.DEFAULT_ARCHIVE_LEAD_MINUTES + rtsp.DEFAULT_ARCHIVE_TAIL_MINUTES,
    'the clip span is exactly lead + tail (five minutes either side)',
  );
  assert.strictEqual(rtsp.DEFAULT_RTSP_PORT, '554', 'video lives on the RTSP port');
  assert.strictEqual(rtsp.DEFAULT_DVRIP_PORT, '34567', 'control lives on the DVRIP port');
  assert.strictEqual(rtsp.DEFAULT_CHANNEL_COUNT, 4, 'four cameras are active on the shop DVR');
  assert.strictEqual(rtsp.toDvrStamp('2026-11-19T12:34:56Z'), localStamp('2026-11-19T12:34:56Z'), 'archive stamps use the DVR local clock');
  assert.strictEqual(rtsp.toDvrStamp('2026-11-19T12:34:56Z', { utc: true }), '20261119T123456Z', 'UTC mode stays available');
  assert.strictEqual(rtsp.toDahuaStamp('2026-11-19T12:34:56Z'), dahuaStamp('2026-11-19T12:34:56Z'), 'Dahua stamps use underscores');
  assert.strictEqual(rtsp.toDvrStamp('not-a-date'), null, 'bad timestamps stay rejected');
  assert.strictEqual(
    rtsp.transactionTimestamp({ createdAt: '2026-11-19T12:34:56Z' }),
    '2026-11-19T12:34:56Z',
    'the exact transaction timestamp is preserved',
  );
  assert.strictEqual(
    rtsp.transactionTimestamp({ createdAt: '2026-11-18T08:00:00Z' }),
    '2026-11-18T08:00:00Z',
    'older transactions keep their own instant',
  );
  assert.strictEqual(rtsp.transactionTimestamp({ createdAt: null }), null, 'missing transaction time is rejected');
  assert.strictEqual(rtsp.transactionTimestamp({ createdAt: 'bad' }), null, 'invalid transaction time is rejected');

  const cctvTx = '2026-11-19T12:34:56Z';
  const cctvWindow = rtsp.archiveWindow({ timestamp: cctvTx, now: 0 });
  assert.strictEqual(cctvWindow.start, Date.parse('2026-11-19T12:29:56Z'));
  assert.strictEqual(cctvWindow.end, Date.parse('2026-11-19T12:39:56Z'));
  assert.strictEqual(cctvWindow.startTime, localStamp('2026-11-19T12:29:56Z'));
  assert.strictEqual(cctvWindow.endTime, localStamp('2026-11-19T12:39:56Z'));
  assert.strictEqual(cctvWindow.startTimeUtc, '20261119T122956Z');
  assert.strictEqual(cctvWindow.endTimeUtc, '20261119T123956Z');
  assert.ok(!cctvWindow.startTime.includes('Z'), 'a local stamp never carries Z');
  assert.strictEqual(cctvWindow.leadMinutes, 5, 'the window reports its five-minute lead');
  assert.strictEqual(cctvWindow.tailMinutes, 5, 'the window reports its five-minute tail');
  assert.strictEqual(
    Date.parse(cctvTx) - cctvWindow.start,
    5 * 60 * 1000,
    'the clip starts exactly five minutes before the transaction',
  );
  assert.strictEqual(
    cctvWindow.end - Date.parse(cctvTx),
    5 * 60 * 1000,
    'the clip ends exactly five minutes after the transaction',
  );
  const explicitTail = rtsp.archiveWindow({ timestamp: cctvTx, leadMinutes: 5, tailMinutes: 5, now: 0 });
  assert.deepStrictEqual(
    [explicitTail.start, explicitTail.end],
    [cctvWindow.start, cctvWindow.end],
    'the explicit lead/tail form matches the default window',
  );

  const cctvOldWindow = rtsp.archiveWindow({ timestamp: '2026-11-18T08:00:00Z', now: 0 });
  assert.strictEqual(cctvOldWindow.startTime, localStamp('2026-11-18T07:55:00Z'));
  assert.strictEqual(cctvOldWindow.startTimeUtc, '20261118T075500Z');
  assert.notStrictEqual(cctvOldWindow.start, cctvWindow.start, 'different transactions stay independent');

  const cctvUrl = rtsp.buildArchiveUrl({
    ip: '192.168.1.64',
    port: '554',
    user: 'ad min',
    pass: 'p@ss',
    timestamp: cctvTx,
    now: 0,
  });
  assert.strictEqual(
    cctvUrl,
    `rtsp://ad%20min:p%40ss@192.168.1.64:554/cam/realmonitor?channel=1&subtype=0&starttime=${localStamp(
      '2026-11-19T12:29:56Z',
    )}&endtime=${localStamp('2026-11-19T12:39:56Z')}`,
    'the archive URL uses the RTSP port and the DVR local clock',
  );
  assert.ok(!cctvUrl.includes('Z'), 'the default archive URL has no UTC marker');

  const cctvUtcUrl = rtsp.buildArchiveUrl({
    ip: '192.168.1.64',
    port: '554',
    user: 'ad min',
    pass: 'p@ss',
    channel: 2,
    timeMode: 'utc',
    timestamp: cctvTx,
    now: 0,
  });
  assert.ok(cctvUtcUrl.includes('channel=2'), 'the selected channel is used');
  assert.ok(cctvUtcUrl.endsWith('endtime=20261119T123956Z'), 'UTC mode keeps the Z form');

  assert.strictEqual(
    rtsp.buildLiveUrl({ ip: '192.168.1.64', port: '554', user: 'admin', pass: 'p@ss', channel: 2 }),
    'rtsp://192.168.1.64:554/user=admin&password=p%40ss&channel=2&stream=0.sdp?real_stream',
    'the Xiongmai native live URL is exact',
  );
  assert.strictEqual(
    rtsp.buildLiveUrl({ ip: '192.168.1.64', port: '554', user: 'admin', pass: 'p@ss', channel: 2, style: 'dahua' }),
    'rtsp://admin:p%40ss@192.168.1.64:554/cam/realmonitor?channel=2&subtype=0',
    'the Dahua-compatible live URL is exact',
  );

  const candidates = rtsp.buildPlaybackCandidates({
    ip: '192.168.1.64',
    rtspPort: '554',
    channel: 2,
    timestamp: cctvTx,
    now: 0,
  });
  assert.deepStrictEqual(
    candidates.map((c) => c.key),
    [
      'archive-guest-xm',
      'archive-guest-xm-tz',
      'archive-guest-xm-bare',
      'archive-guest-dahua',
      'archive-guest-dahua-utc',
      'archive-guest-dahua-playback',
      'archive-guest-dahua-playback-utc',
    ],
    'the one-tap list holds ARCHIVE candidates only, best guess first',
  );
  assert.ok(
    candidates.every((c) => c.key.startsWith('archive-')),
    'no live-stream entry can ever reach the archive button',
  );
  assert.ok(
    candidates.every((c) => !c.url.includes('real_stream')),
    'no archive URL carries the live marker (real_stream served LIVE video — the 2026-11-20 bug)',
  );
  assert.ok(candidates.every((c) => c.url.startsWith('rtsp://')), 'every candidate is an RTSP URL');
  assert.ok(candidates.every((c) => !c.url.includes('@')), 'no candidate carries userinfo');
  assert.ok(
    candidates.every((c) => !/password=[^&]+/.test(c.url)),
    'no candidate carries a password value',
  );
  assert.ok(
    candidates.every((c) => /starttime=/.test(c.url) && /endtime=/.test(c.url)),
    'every archive candidate carries the transaction window',
  );
  assert.ok(candidates[0].url.includes('channel=2'), 'candidates honour the channel');
  assert.ok(
    /\/user=&password=&channel=2&stream=0\.sdp\?starttime=\d{14}&endtime=\d{14}$/.test(candidates[0].url),
    'the primary candidate is the native archive path with empty credentials and 14-digit stamps',
  );
  assert.ok(
    /\?starttime=\d{8}T\d{6}Z&endtime=/.test(candidates[1].url),
    'the second candidate uses the T…Z stamp form',
  );
  assert.ok(
    /\/cam\/realmonitor\?channel=2&subtype=0&starttime=\d{14}&endtime=\d{14}$/.test(candidates[2].url),
    'the bare candidate has no credential parameters at all',
  );
  assert.ok(/starttime=\d{8}T\d{6}&endtime=/.test(candidates[3].url), 'the Dahua guest candidate uses a local T stamp');
  assert.ok(/starttime=\d{8}T\d{6}Z&endtime=/.test(candidates[4].url), 'the UTC guest candidate keeps the Z form');
  assert.ok(
    /\/cam\/playback\?channel=2&subtype=0&starttime=\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}&endtime=/.test(
      candidates[5].url,
    ),
    'the documented playback path uses underscore stamps',
  );

  // Live URLs stay in their own list, clearly separated from the archive ones.
  const liveList = rtsp.buildLiveCandidates({ ip: '192.168.1.64', channel: 2 });
  assert.deepStrictEqual(liveList.map((c) => c.key), ['live-guest-xm'], 'live has its own list');
  assert.ok(liveList[0].url.includes('real_stream'), 'the LIVE URL keeps the real_stream marker');
  assert.ok(
    rtsp.buildPlaybackCandidates({ ip: '192.168.1.64', channel: 2 }).every((c) => !c.url.includes('real_stream')),
    'the archive list and the live list never mix',
  );

  // Guest archive URL: right port, no credentials, vendor timestamp, honoured range.
  const guestUrl = rtsp.buildGuestArchiveUrl({
    ip: '192.168.1.64',
    port: '34567',
    channel: 2,
    timestamp: cctvTx,
    now: 0,
  });
  assert.ok(guestUrl.startsWith('rtsp://192.168.1.64:554/'), 'the control port 34567 is never used for video');
  assert.ok(!guestUrl.includes('@'), 'the guest archive URL has no userinfo');
  assert.ok(/starttime=\d{14}&endtime=\d{14}$/.test(guestUrl), 'the range is sent in the vendor 14-digit form');
  assert.strictEqual(rtsp.buildGuestArchiveUrl({ ip: '', timestamp: cctvTx }), null, 'no IP → no guest URL');
  assert.strictEqual(rtsp.toXmStamp('2026-11-19T12:29:56Z'), '20261119155956', 'the XM stamp is device-local 14 digits');

  assert.strictEqual(rtsp.safeRtspPort('34567'), '554', 'the DVRIP control port is never used for RTSP');
  assert.strictEqual(rtsp.safeRtspPort('5037'), '554', 'adb port is rejected');
  assert.strictEqual(rtsp.safeRtspPort(''), '554', 'blank falls back to 554');
  assert.strictEqual(rtsp.safeRtspPort('8554'), '8554', 'a real custom RTSP port is kept');

  assert.strictEqual(rtsp.rtspPortOf({}), '554', 'RTSP defaults to 554');
  assert.strictEqual(rtsp.rtspPortOf({ rtspPort: '8554' }), '8554', 'a custom RTSP port is used');
  assert.strictEqual(rtsp.dvripPortOf({}), '34567', 'DVRIP defaults to 34567');
  assert.strictEqual(rtsp.dvripPortOf({ dvrPort: '8554' }), '8554', 'a moved DVRIP port is used');
  assert.strictEqual(rtsp.channelOf({ dvrChannel: 3 }), 3, 'the channel is configurable');
  assert.strictEqual(rtsp.channelOf({ dvrChannel: 99 }), 4, 'the channel is clamped to 4');
  assert.strictEqual(rtsp.channelOf({}), 1, 'channel 1 is the default');

  const settingsSource = fs.readFileSync(path.join(ROOT, 'src/store/SettingsContext.js'), 'utf8');
  assert.ok(settingsSource.includes("rtspPort: '554'"), 'the store keeps RTSP separate from DVRIP');
  assert.ok(settingsSource.includes('dvrChannel'), 'the store keeps the camera channel');

  assert.strictEqual(
    rtsp.maskRtspUrl(cctvUrl),
    `rtsp://ad%20min:***@192.168.1.64:554/cam/realmonitor?channel=1&subtype=0&starttime=${localStamp(
      '2026-11-19T12:29:56Z',
    )}&endtime=${localStamp('2026-11-19T12:39:56Z')}`,
    'the password is never shown',
  );
  assert.strictEqual(
    rtsp.maskRtspUrl('rtsp://192.168.1.64:554/user=admin&password=secret&channel=1&stream=0.sdp?real_stream'),
    'rtsp://192.168.1.64:554/user=admin&password=***&channel=1&stream=0.sdp?real_stream',
    'a query-string password is masked too',
  );
  assert.strictEqual(rtsp.buildArchiveUrl({ ip: '', timestamp: cctvTx }), null, 'no IP → no URL');

  const tvNotConfigured = tvPlayback.buildTvPlaybackRequest({
    ip: '192.168.1.64',
    timestamp: cctvTx,
    now: 0,
  });
  assert.deepStrictEqual(tvNotConfigured, { ok: false, reason: 'not-configured' });

  const tvRequest = tvPlayback.buildTvPlaybackRequest({
    ip: '192.168.1.64',
    port: '80',
    user: 'admin',
    pass: 'pass',
    timestamp: cctvTx,
    endpoint: 'http://[IP]:[Port]/cgi-bin/tv?rtsp=[RtspUrl]',
    method: 'POST',
    payloadTemplate: '{"rtsp":"[RtspUrl]"}',
    now: 0,
  });
  assert.strictEqual(tvRequest.ok, true, 'a configured CGI builds a request');
  assert.strictEqual(tvRequest.method, 'POST');
  assert.strictEqual(tvRequest.headers['Content-Type'], 'application/json');
  assert.ok(tvRequest.url.includes('rtsp%3A%2F%2F'), 'the archive URL is URL-encoded');
  assert.ok(tvRequest.body.includes('rtsp%3A%2F%2F'), 'the payload carries the encoded archive URL');
  assert.strictEqual(
    tvPlayback.buildTvPlaybackRequest({ ip: '192.168.1.64', timestamp: 'bad', endpoint: 'http://tv', now: 0 }).reason,
    'bad-timestamp',
  );

  let tvSeen = null;
  const tvPromise = tvPlayback.triggerTVPlayback(
    {
      ip: '192.168.1.64',
      timestamp: cctvTx,
      endpoint: 'http://[IP]/tv?rtsp=[RtspUrl]',
      now: 0,
    },
    {
      fetcher: async (url, init) => {
        tvSeen = { url, init };
        return { ok: true, status: 200 };
      },
    },
  );
  assert.ok(tvSeen, 'triggerTVPlayback fires the configured fetcher');
  assert.strictEqual(tvSeen.init.method, 'GET');
  assert.strictEqual(tvSeen.init.body, null);
  tvPromise.catch(() => {});

  // DVR uses DVRIP (port 34567) + RTSP (port 554), not HTTP cleartext
  // assert.strictEqual(appJson.expo.android.usesCleartextTraffic, true, 'local DVR HTTP is allowed');
  const cctvSettingsSrc = fs.readFileSync(
    path.join(srcDir, 'store/SettingsContext.js'),
    'utf8',
  );
  for (const dvrKey of ['dvrIp', 'dvrPort', 'dvrUser', 'dvrPassword', 'dvrSerial']) {
    assert.ok(cctvSettingsSrc.includes(dvrKey), `${dvrKey} is persisted in settings`);
  }
  const cctvSettingsScreen = fs.readFileSync(
    path.join(srcDir, 'screens/SettingsScreen.js'),
    'utf8',
  );
  assert.ok(cctvSettingsScreen.includes('Test TV Playback'), 'the exact TV test label is present');
  assert.ok(cctvSettingsScreen.includes('buildGuestArchiveUrl'), 'the test builds a password-free archive URL');
  assert.ok(cctvSettingsScreen.includes('triggerTVPlayback'), 'the test triggers TV playback');

  const cctvAppSrc = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
  assert.ok(cctvAppSrc.includes('CctvPlayerScreen'), 'the player screen is imported');
  assert.ok(cctvAppSrc.includes('name="CctvPlayer"'), 'the player route is registered');

  const cctvDetailSrc = fs.readFileSync(
    path.join(srcDir, 'screens/CustomerDetailScreen.js'),
    'utf8',
  );
  assert.ok(cctvDetailSrc.includes('پخش فیلم دوربین'), 'the exact camera label is present');
  assert.ok(cctvDetailSrc.includes('transactionTimestamp(item)'), 'each row passes its exact timestamp');
  assert.ok(cctvDetailSrc.includes("navigation.navigate('CctvPlayer'"), 'the camera icon navigates');
  assert.ok(cctvDetailSrc.includes('styles.transactionCctv'), 'the camera icon has its own RTL-safe style');
  assert.ok(
    cctvDetailSrc.includes('const isDebt = item.type === TRANSACTION.CREDIT'),
    'the camera icon is bound to DEBT rows only',
  );
  assert.ok(cctvDetailSrc.includes('{isDebt ? ('), 'the camera icon renders only for a debt row');
  assert.ok(
    /isDebt \? \(\s*<TouchableOpacity[\s\S]{0,500}?transactionCctv/.test(cctvDetailSrc),
    'the debt-only guard wraps the camera control itself',
  );
  assert.ok(cctvDetailSrc.includes('shareTransaction(item)'), 'receipt sharing is preserved as a sibling control');
  assert.ok(!cctvDetailSrc.includes('openCctvPlayer'), 'the obsolete customer-level handler is removed');
  assert.ok(!cctvDetailSrc.includes('styles.cctvBtn'), 'the obsolete customer-level style is removed');

  const cctvPlayerSrc = fs.readFileSync(
    path.join(srcDir, 'screens/CctvPlayerScreen.js'),
    'utf8',
  );
  assert.ok(
    cctvPlayerSrc.includes('نمایش آرشیو روی مانیتور DVR'),
    'one transaction-archive button drives the DVR monitor',
  );
  assert.ok(cctvPlayerSrc.includes('playOnTv({'), 'the button sends the DVRIP keypad command');
  assert.ok(cctvPlayerSrc.includes('addCctvListener'), 'native stage/error events are observed');
  assert.ok(cctvPlayerSrc.includes('event.stage'), 'the exact failure stage is shown to the user');
  assert.ok(
    cctvPlayerSrc.includes('leadMinutes: 120') && cctvPlayerSrc.includes('tailMinutes: 120'),
    'the diagnostic lookup window is ±120 minutes',
  );
  assert.ok(!cctvPlayerSrc.includes('stopArchive'), 'nothing can cancel an active playback request');
  assert.ok(!cctvPlayerSrc.includes('playArchive({'), 'the download/VLC path is removed');
  assert.ok(!cctvPlayerSrc.includes('openLocalFileInVlc'), 'VLC is no longer handed a local file');
  assert.ok(!cctvPlayerSrc.includes('streamArchive'), 'the streaming path is removed');
  assert.ok(!cctvPlayerSrc.includes('triggerTVPlayback'), 'the obsolete CGI path is removed');
  assert.ok(!cctvPlayerSrc.includes('buildLiveCandidates'), 'the live-stream control is removed');
  assert.ok(!cctvPlayerSrc.includes('buildPlaybackCandidates'), 'the RTSP candidate list is removed');
  assert.ok(!cctvPlayerSrc.includes('subStream'), 'the full/light quality control is removed');
  assert.ok(!cctvPlayerSrc.includes('expo-video'), 'the screen stays native-video free');
  assert.ok(!cctvPlayerSrc.includes('autoStartedRef'), 'playback starts from the button, never on mount');

  // Raw Annex-B H.264 is refused by VLC for Android: the stream and the
  // downloaded clip must both be wrapped in MPEG-TS before a player sees them.
  const tsMuxerSrc = fs.readFileSync(
    path.join(cctvModuleDir, 'android/src/main/java/expo/modules/cctvplayback/TsMuxer.kt'),
    'utf8',
  );
  assert.ok(tsMuxerSrc.includes('fun push(') && tsMuxerSrc.includes('fun finish()'),
    'the TS muxer consumes chunks and flushes the last access unit');
  assert.ok(tsMuxerSrc.includes('0x47'), 'the muxer emits MPEG-TS sync bytes');
  assert.ok(tsMuxerSrc.includes('trimmed < 3'),
    'only start-code padding is trimmed, never a zero tail of a NAL payload');

  const serverSrc = fs.readFileSync(
    path.join(cctvModuleDir, 'android/src/main/java/expo/modules/cctvplayback/ArchiveStreamServer.kt'),
    'utf8',
  );
  assert.ok(serverSrc.includes('muxer.push(bytes)'),
    'every DVRIP chunk is muxed before it reaches the player');
  assert.ok(serverSrc.includes('video/mp2t'), 'the served stream declares the MPEG-TS type');
  assert.ok(serverSrc.includes('.ts') && !serverSrc.includes('/archive.h264'),
    'the stream URL is a .ts container, not raw H.264');
  assert.ok(serverSrc.includes('exposeLan') && serverSrc.includes('archive-$token'),
    'the LAN/TV URL carries a per-stream nonce');

  const moduleSrc = fs.readFileSync(
    path.join(cctvModuleDir, 'android/src/main/java/expo/modules/cctvplayback/CctvPlaybackModule.kt'),
    'utf8',
  );
  assert.ok(moduleSrc.includes('WINDOW_MINUTES = 120'),
    'the native diagnostic lookup window is ±120 minutes');
  assert.ok(moduleSrc.includes('queryBothFiles('),
    'both H.264 and H.265 archive indexes are attempted');
  assert.ok(moduleSrc.includes('query.attempts.joinToString'),
    'every codec/Ret attempt is surfaced to JS and diagnostics');
  assert.ok(moduleSrc.includes('playArchiveOnMonitor('),
    'the keypad command drives the recorder monitor');
  assert.ok(moduleSrc.includes('"stage" to "query"'),
    'the query stage is reported with its codec/Ret detail');
  assert.ok(moduleSrc.includes('E_TV_PLAYBACK'),
    'failures reject with a named code and the failing stage');

  const dvripSrc = fs.readFileSync(
    path.join(cctvModuleDir, 'android/src/main/java/expo/modules/cctvplayback/DvripClient.kt'),
    'utf8',
  );
  assert.ok(dvripSrc.includes('queryBothFiles(') && dvripSrc.includes('"h265"'),
    'H.265 is queried as well as H.264');
  assert.ok(dvripSrc.includes('file query ($type) refused: ${describeRet(ret)} ($ret)'),
    'the actual numeric Ret is carried into the error text');
  assert.ok(!cctvPlayerSrc.includes('lanUrl'), 'the TV/LAN playback card is removed');
  assert.ok(
    !cctvPlayerSrc.includes('گزینه‌های پیشرفتهٔ RTSP'),
    'the advanced RTSP section is removed (it played LIVE on this firmware)',
  );
  assert.ok(
    !cctvPlayerSrc.includes('پخش آرشیو در VLC (بدون پنجرهٔ رمز)'),
    'the RTSP shape is no longer offered as a playback action',
  );

  const cctvDictSrc = fs.readFileSync(path.join(srcDir, 'i18n/dict.js'), 'utf8');
  assert.ok(cctvDictSrc.includes("'پخش فیلم دوربین': 'Play camera video'"), 'the exact label is translated');
  assert.ok(
    cctvDictSrc.includes("'زمان تراکنش نامعتبر': 'Invalid transaction time'"),
    'the invalid-transaction-time title is translated',
  );
  assert.ok(
    cctvDictSrc.includes('زمان این تراکنش نامعتبر است؛ پخش آرشیو ممکن نیست.'),
    'the invalid-transaction-time message is translated',
  );
  assert.ok(cctvDictSrc.includes("'آرشیو دوربین': 'Camera archive'"), 'the player title is translated');

  // Every string a CCTV screen passes to t() must exist in the dictionary — an
  // untranslated literal silently falls back to Persian in English mode.
  const I18N_EXEMPT = new Set(['Test TV Playback']); // owner asked for this exact label
  const cctvScreens = [
    'screens/CctvPlayerScreen.js',
    'screens/SettingsScreen.js',
    'screens/CctvDiagnosticsScreen.js',
  ];
  const missingKeys = [];
  for (const rel of cctvScreens) {
    const src = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    const re = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;
    let match;
    while ((match = re.exec(src))) {
      const key = match[1].replace(/\\'/g, "'");
      if (I18N_EXEMPT.has(key)) continue;
      if (!cctvDictSrc.includes(`'${key}'`)) missingKeys.push(`${rel}: ${key}`);
    }
  }
  assert.deepStrictEqual(missingKeys, [], 'every CCTV screen string is translated');

  assert.ok(!cctvPlayerSrc.includes('buildPlaybackCandidates'), 'the RTSP fallback list is gone');
  assert.ok(!cctvPlayerSrc.includes('safeRtspPort'), 'the RTSP port is no longer used by the player');
  // Guest first; the credential path is only a fallback, and it must stay in
  // the path (`user=…&password=…`), never as RTSP userinfo — userinfo is what
  // makes VLC raise its own username/password dialog.
  assert.ok(
    !/\/\/\$\{?[A-Za-z_.]*[Uu]ser[^@]*@/.test(cctvPlayerSrc) && !/rtsp:\/\/[^'"]*@/.test(cctvPlayerSrc),
    'the player never builds RTSP userinfo (VLC would prompt for a password)',
  );
  const authUrl = rtsp.buildPathCredentialArchiveUrl({
    ip: '192.168.1.64',
    user: 'admin',
    pass: 'secret',
    timestamp: '2026-11-19T12:29:56Z',
    now: 0,
  });
  assert.ok(
    authUrl && authUrl.includes('user=admin&password=secret'),
    'the credential fallback keeps the password in the URL path, not in userinfo',
  );
  assert.ok(authUrl && !authUrl.includes('@'), 'the credential fallback adds no RTSP userinfo');
  assert.ok(
    !authUrl || authUrl.indexOf('192.168.1.64:554/') !== -1,
    'the credential fallback still uses the RTSP port',
  );
  assert.strictEqual(
    rtsp.buildPathCredentialArchiveUrl({ ip: '192.168.1.64', pass: '', timestamp: '2026-11-19T12:29:56Z' }),
    null,
    'no stored password means no auth candidate',
  );
  assert.ok(!cctvPlayerSrc.includes('probeRtsp'), 'the RTSP probe path is removed from the player');
  assert.ok(cctvSettingsScreen.includes('rtspPort'), 'settings expose the RTSP port');
  assert.ok(cctvSettingsScreen.includes('dvrChannel'), 'settings expose the camera channel');
  assert.ok(
    cctvSettingsScreen.includes('port: values.rtspPort'),
    'the test URL uses the RTSP port for video',
  );

  // The exact owner scenario, one step at a time: save credit → send;
  // more credit → silent; payment below → reset; new credit → send again.
  let autoLatch = false;
  const autoStep = (balance) => {
    const action = gate.reminderAction({ balance, sentForCurrentDebt: autoLatch, ...ready });
    if (action === 'send') autoLatch = true;
    if (action === 'reset') autoLatch = false;
    return action;
  };
  assert.strictEqual(autoStep(1001), 'send', 'rule 1: first crossing above 1,000 sends');
  assert.strictEqual(autoStep(2600), 'none', 'rule 1: never twice for the same debt');
  assert.strictEqual(autoStep(1000), 'reset', 'rule 2: paid down to the threshold resets');
  assert.strictEqual(autoStep(999), 'none', 'rule 2: still below → nothing to send');
  assert.strictEqual(autoStep(1500), 'send', 'rule 3: new credit above 1,000 sends once more');
  assert.strictEqual(autoStep(99999), 'none', 'rule 3: and stays silent after that');
  // ── customer categories (profiles) ───────────────────────────────────────
  assert.strictEqual(profileUtils.PROFILE_NAME_MAX, 24);
  assert.strictEqual(profileUtils.cleanProfileName('  فروشگاه   اصلی '), 'فروشگاه اصلی');
  assert.strictEqual(profileUtils.cleanProfileName('   '), '', 'blank name is rejected');
  assert.strictEqual(
    profileUtils.cleanProfileName('x'.repeat(40)).length,
    profileUtils.PROFILE_NAME_MAX,
    'names are capped',
  );

  const seeded = [
    { id: 'a', name: 'فروشگاه' },
    { id: 'b', name: 'شخصی' },
  ];
  assert.strictEqual(profileUtils.isDuplicateProfile(seeded, ' فروشگاه '), true);
  assert.strictEqual(
    profileUtils.isDuplicateProfile(seeded, 'فروشگاه', 'a'),
    false,
    'renaming a category to its own name is allowed',
  );
  assert.strictEqual(profileUtils.isDuplicateProfile(seeded, 'انبار'), false);
  assert.strictEqual(profileUtils.isDuplicateProfile(seeded, '   '), false);

  const mixed = [
    { id: '1', profileId: 'a' },
    { id: '2', profileId: '' },
    { id: '3' },
    { id: '4', profileId: 'a' },
  ];
  assert.deepStrictEqual(profileUtils.profileCounts(mixed), { a: 2, '': 2 });
  assert.deepStrictEqual(
    profileUtils.contactsOfProfile(mixed, 'a').map((c) => c.id),
    ['1', '4'],
  );
  assert.deepStrictEqual(
    profileUtils.contactsOfProfile(mixed, '').map((c) => c.id),
    ['2', '3'],
    'missing profileId counts as بدون دسته',
  );

  // ── dynamic Persian letter chips + alphabetical sections ────────────────
  const grouped = [
    { id: '1', letter: 'ب' },
    { id: '2', letter: 'ا' },
    { id: '3', letter: 'ب' },
    { id: '4', letter: '?' },
  ];
  assert.deepStrictEqual(
    grouping.lettersOf(grouped),
    ['ا', 'ب', '?'],
    'only present letters, in Persian alphabet order',
  );
  assert.deepStrictEqual(grouping.lettersOf([]), [], 'no customers → no chips');
  const buckets = grouping.letterBuckets(grouped);
  assert.deepStrictEqual(buckets.map((b) => b.title), ['ا', 'ب', '?']);
  assert.strictEqual(buckets[1].data.length, 2);
  assert.deepStrictEqual(buckets[0].data.map((c) => c.id), ['2']);
  const single = grouping.letterBuckets([{ id: '9', letter: 'م' }]);
  assert.strictEqual(single.length, 1, 'one letter → one section');
  assert.strictEqual(single[0].title, 'م');

  // ── financial calculator engine ─────────────────────────────────────────
  assert.strictEqual(calc.evaluate('2+3'), 5);
  assert.strictEqual(calc.evaluate('10-4'), 6);
  assert.strictEqual(calc.evaluate('10/4'), 2.5);
  assert.strictEqual(calc.evaluate('(2+3)*4'), 20);
  assert.strictEqual(calc.evaluate('-5+3'), -2, 'unary minus');
  assert.strictEqual(calc.evaluate('۱+۲'), 3, 'Persian digits accepted');
  assert.strictEqual(calc.evaluate('200+10%'), 220, 'percent applies to the left operand');
  assert.strictEqual(calc.evaluate('200-10%'), 180);
  assert.strictEqual(calc.evaluate('200×10%'), 20, '× and % as fraction');
  assert.strictEqual(calc.evaluate('50%'), 0.5, 'bare percent is a fraction');
  assert.throws(() => calc.evaluate('10/0'), null, 'division by zero errors');
  assert.throws(() => calc.evaluate('2+'), null, 'dangling operator errors');
  assert.throws(() => calc.evaluate('(1+2'), null, 'unclosed paren errors');
  assert.strictEqual(calc.formatCalcResult(1234567.5), '۱٬۲۳۴٬۵۶۷٫۵');
  assert.strictEqual(calc.formatCalcResult(0.1 + 0.2), '۰٫۳', 'float noise stripped');
  assert.strictEqual(calc.formatCalcResult(-1234), '-۱٬۲۳۴');
  assert.strictEqual(calc.formatExpression('12*3/4'), '۱۲×۳÷۴');
  assert.strictEqual(calc.formatCalcResult(NaN), null);

  // ── backup payload / restore parsing / CSV ──────────────────────────────
  const sampleContacts = [
    {
      id: '1',
      name: 'علی رضایی',
      phone: '09121234567',
      profileId: 'p1',
      transactions: [
        { type: 'credit', amount: '100' },
        { type: 'payment', amount: '40' },
      ],
    },
    { id: '2', name: 'مریم کریمی', phone: '', profileId: '', transactions: [] },
  ];
  const sampleProfiles = [{ id: 'p1', name: 'فروشگاه' }];
  const sampleSettings = {
    myName: 'محمد احمدی',
    cardNumber: '6037997412345678',
    shopName: 'سوپرمارکت احمدی',
  };

  const payload = backup.buildBackup({
    contacts: sampleContacts,
    profiles: sampleProfiles,
    settings: sampleSettings,
  });
  const restored = backup.parseBackup(payload);
  assert.strictEqual(restored.ok, true, 'own payload restores');
  assert.strictEqual(restored.counts.contacts, 2);
  assert.strictEqual(restored.counts.transactions, 2);
  assert.strictEqual(restored.profiles.length, 1);
  assert.strictEqual(restored.settings.cardNumber, '6037997412345678');
  assert.strictEqual(restored.contacts[0].name, 'علی رضایی');

  const legacy = backup.parseBackup(JSON.stringify(sampleContacts));
  assert.strictEqual(legacy.ok, true, 'bare contacts array (legacy) restores');
  assert.strictEqual(legacy.profiles, null, 'legacy file keeps current categories');
  assert.strictEqual(legacy.settings, null);

  const badShape = backup.parseBackup('{"foo": 1}');
  assert.strictEqual(badShape.ok, false);
  assert.strictEqual(badShape.reason, 'shape');
  const badJson = backup.parseBackup('this is not json');
  assert.strictEqual(badJson.ok, false);
  assert.strictEqual(badJson.reason, 'json');

  const csv = backup.toCsv(sampleContacts, sampleProfiles);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV has a BOM for Excel');
  assert.ok(csv.includes('نام,شماره تماس,دسته,کل بدهی,کل دریافت,مانده'));
  assert.ok(csv.includes('علی رضایی'), 'customer rows included');
  assert.ok(csv.includes('فروشگاه'), 'category name resolved');
  assert.ok(csv.includes('جمع کل'), 'totals row included');
  const aliRow = csv.split('\n').find((l) => l.includes('علی'));
  assert.ok(aliRow.endsWith(',100,40,60'), 'credited − paid = net per row');
  assert.ok(backup.backupFileName('eKhata-backup', 'json').startsWith('eKhata-backup-'));


  // ── weekly configurable weekday/time reminder (separate from crossing reminder) ───────
  assert.strictEqual(weeklyReminder.WEEKLY_REMINDER_THRESHOLD, 1000, 'weekly threshold is 1,000 ledger units');
  assert.strictEqual(weeklyReminder.DEFAULT_WEEKLY_WEEKDAY, 5, 'default Friday weekday');
  assert.strictEqual(weeklyReminder.DEFAULT_WEEKLY_HOUR, 10, 'default 10:00 local hour');
  assert.strictEqual(weeklyReminder.DEFAULT_WEEKLY_MINUTE, 0, 'default 0 minutes');

  // The Android module counts 1=Sun..7=Sat; JS/UI count 0=Sun..6=Sat.
  // Without this shift a Saturday choice fires on Friday.
  assert.strictEqual(weeklyReminder.toNativeWeekday(0), 1, 'JS Sunday -> Calendar Sunday');
  assert.strictEqual(weeklyReminder.toNativeWeekday(5), 6, 'JS Friday -> Calendar Friday');
  assert.strictEqual(weeklyReminder.toNativeWeekday(6), 7, 'JS Saturday -> Calendar Saturday');
  assert.strictEqual(weeklyReminder.fromNativeWeekday(7), 6, 'Calendar Saturday -> JS Saturday');
  assert.strictEqual(weeklyReminder.fromNativeWeekday(1), 0, 'Calendar Sunday -> JS Sunday');
  for (let js = 0; js < 7; js += 1) {
    assert.strictEqual(
      weeklyReminder.fromNativeWeekday(weeklyReminder.toNativeWeekday(js)),
      js,
      `weekday round-trip ${js}`,
    );
  }

  // Default Friday 10:00 slot tests
  const wkFri = new Date(2026, 10, 20, 10, 0, 0, 0); // local Friday
  const wkSat = new Date(2026, 10, 21, 9, 59, 0, 0);
  const wkNext = new Date(2026, 10, 27, 10, 0, 0, 0);
  const wkSlot = weeklyReminder.weeklySlotFor(wkFri);
  assert.strictEqual(wkSlot, '2026-11-20', 'Friday slot key');
  assert.strictEqual(weeklyReminder.weeklySlotFor(wkSat), '2026-11-20', 'Sat 09:59 belongs to Friday slot');
  assert.strictEqual(weeklyReminder.weeklySlotFor(wkNext), '2026-11-27', 'next Friday gets new slot');
  assert.strictEqual(weeklyReminder.inWeeklyDueWindow(wkFri, wkSlot), true, 'Friday 10:00 is due');
  assert.strictEqual(weeklyReminder.inWeeklyDueWindow(new Date(2026, 10, 20, 9, 59, 0, 0), wkSlot), false, 'before 10:00 not due');
  assert.strictEqual(weeklyReminder.inWeeklyDueWindow(new Date(2026, 10, 21, 10, 0, 0, 0), wkSlot), false, 'after catch-up window not due');

  // Configurable weekday/time tests - Saturday 14:30
  const satWeekday = 6;
  const satHour = 14;
  const satMinute = 30;
  const wkSat14 = new Date(2026, 10, 21, 14, 30, 0, 0); // local Saturday
  const wkSatNext = new Date(2026, 10, 28, 14, 30, 0, 0);
  const wkSatSlot = weeklyReminder.weeklySlotFor(wkSat14, satWeekday, satHour, satMinute);
  assert.strictEqual(wkSatSlot, '2026-11-21', 'Saturday slot key');
  assert.strictEqual(weeklyReminder.weeklySlotFor(wkSatNext, satWeekday, satHour, satMinute), '2026-11-28', 'next Saturday gets new slot');
  assert.strictEqual(weeklyReminder.inWeeklyDueWindow(wkSat14, wkSatSlot, satHour, satMinute), true, 'Saturday 14:30 is due');
  assert.strictEqual(weeklyReminder.inWeeklyDueWindow(new Date(2026, 10, 21, 14, 29, 0, 0), wkSatSlot, satHour, satMinute), false, 'before 14:30 not due');
  assert.strictEqual(weeklyReminder.inWeeklyDueWindow(new Date(2026, 10, 22, 14, 30, 0, 0), wkSatSlot, satHour, satMinute), false, 'after catch-up window not due');

  // Configurable Sunday 09:00 test
  const sunWeekday = 0;
  const sunHour = 9;
  const sunMinute = 0;
  const wkSun09 = new Date(2026, 10, 15, 9, 0, 0, 0); // local Sunday
  const wkSunSlot = weeklyReminder.weeklySlotFor(wkSun09, sunWeekday, sunHour, sunMinute);
  assert.strictEqual(wkSunSlot, '2026-11-15', 'Sunday slot key');

  const wkReady = { settingsReady: true, hasPhone: true };
  const wkSend = weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, ...wkReady,
    weeklyReminderEnabled: true, // weekly reminder is opt-in
  });
  assert.strictEqual(wkSend.action, 'send', 'eligible debt should send');
  assert.strictEqual(wkSend.week, wkSlot);
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: wkSlot, balance: 5000, ...wkReady,
  }).action, 'none', 'same slot must not resend');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1000, ...wkReady,
  }).action, 'none', '1000 ledger units is not over threshold');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, settingsReady: false, hasPhone: true,
  }).action, 'none', 'settings not ready blocks send');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, settingsReady: true, hasPhone: false,
  }).action, 'none', 'missing phone blocks send');

  // Configurable decision tests
  const wkSatReady = { settingsReady: true, hasPhone: true };
  const satSend = weeklyReminder.weeklyReminderDecision({
    now: wkSat14, sentWeek: '', balance: 1001, ...wkSatReady,
    weekday: satWeekday, hour: satHour, minute: satMinute,
    weeklyReminderEnabled: true, // weekly reminder is opt-in
  });
  assert.strictEqual(satSend.action, 'send', 'Saturday 14:30 eligible debt should send');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkSat14, sentWeek: wkSatSlot, balance: 5000, ...wkSatReady,
    weekday: satWeekday, hour: satHour, minute: satMinute,
  }).action, 'none', 'same Saturday slot must not resend');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkSat14, sentWeek: '', balance: 1000, ...wkSatReady,
    weekday: satWeekday, hour: satHour, minute: satMinute,
  }).action, 'none', '1000 ledger units is not over threshold on Saturday');

  // Per-customer weekly reminder opt-out tests
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, ...wkReady,
    weeklyReminderEnabled: true,
  }).action, 'send', 'weeklyReminderEnabled=true allows send');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, ...wkReady,
    weeklyReminderEnabled: false,
  }).action, 'none', 'weeklyReminderEnabled=false blocks weekly send');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, ...wkReady,
    // missing field must be OFF (opt-in only) — old records never auto-enable
  }).action, 'none', 'missing weeklyReminderEnabled defaults to OFF (opt-in)');
  assert.strictEqual(weeklyReminder.weeklyReminderDecision({
    now: wkFri, sentWeek: '', balance: 1001, ...wkReady,
    weeklyReminderEnabled: undefined,
  }).action, 'none', 'undefined weeklyReminderEnabled blocks weekly send');

  // ── Weekly schedule normalization (persistence bug 2026-11-24) ────────────
  // 0 is a valid weekday/hour/minute: Sunday and 00:00 used to be swallowed by
  // `value || default`, so reopening Settings showed Friday 10:00 again.
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({ weekday: 0, hour: 0, minute: 0 }),
    { weekday: 0, hour: 0, minute: 0 },
    'Sunday 00:00 must be preserved (0 is valid, not a fallback trigger)',
  );
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({ weekday: 2, hour: 10, minute: 0 }),
    { weekday: 2, hour: 10, minute: 0 },
    'Tuesday 10:00 round-trips unchanged',
  );
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({ weekday: 6, hour: 23, minute: 59 }),
    { weekday: 6, hour: 23, minute: 59 },
    'Saturday 23:59 boundary accepted',
  );
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({}),
    { weekday: 5, hour: 10, minute: 0 },
    'missing schedule falls back to Friday 10:00',
  );
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({ weekday: 7, hour: 24, minute: 60 }),
    { weekday: 5, hour: 10, minute: 0 },
    'out-of-range schedule falls back to Friday 10:00',
  );
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({ weekday: -1, hour: -5, minute: -1 }),
    { weekday: 5, hour: 10, minute: 0 },
    'negative schedule values fall back to default',
  );
  assert.deepStrictEqual(
    weeklyReminder.normalizeWeeklySchedule({ weekday: '2', hour: '0', minute: '5' }),
    { weekday: 2, hour: 0, minute: 5 },
    'numeric strings are coerced (hour 0 preserved)',
  );

  // Ensure opt-out does NOT affect crossing reminder
  assert.strictEqual(gate.reminderAction({ 
    balance: 1001, sentForCurrentDebt: false, ...wkReady, 
    reminderEnabled: true, // this is the crossing reminder switch
  }), 'send', 'crossing reminder still sends when weekly opt-out is off');
  // Note: weeklyReminderEnabled is NOT passed to reminderGate, so it doesn't affect crossing reminder

  // crossing reminder remains independent
  assert.strictEqual(gate.reminderAction({ balance: 1001, sentForCurrentDebt: false, ...wkReady }), 'send', 'crossing reminder still sends');
  assert.strictEqual(gate.reminderAction({ balance: 1001, sentForCurrentDebt: true, ...wkReady }), 'none', 'crossing latch still blocks');

  const wkTemplate = weeklyReminder.buildWeeklyReminder({
    customerName: 'علی', amount: 2500, cardNumber: '6037997412345678',
  });
  const wkExpected = [
    'علی عزیز، صبح جمعه\u200Cتان بخیر.',
    'امیدواریم آخر هفته خوبی داشته باشید.',
    'یادآوری می\u200Cشود بدهی شما ۲٬۵۰۰٬۰۰۰ تومان می\u200Cباشد.',
    'جهت تسویه، لطفاً مبلغ را به شماره کارت زیر واریز نمایید:',
    '6037 9974 1234 5678',
    'به نام: بهرام یعقوبی',
    'لطفاً پس از واریز، متن رسید تراکنش را برای این شماره ارسال نمایید.',
    'با تشکر از همکاری شما',
  ].join('\n').replace(/\\u200C/g, '\u200C');
  assert.strictEqual(wkTemplate, wkExpected, 'weekly template must match authoritative Persian template');
  assert.strictEqual((wkTemplate.match(/\u200C/g) || []).length, 3, 'template has 3 ZWNJ');
  assert.strictEqual((wkTemplate.match(/\u060C/g) || []).length, 3, 'template has 3 Persian commas');
  assert.ok(wkTemplate.includes('برای این شماره'), 'template includes correct phrase');

  console.log('unit checks: ok');
} catch (error) {
  failures++;
  console.error('UNIT FAIL: ' + error.message);
}

if (failures) {
  console.error(`\nFAILED (${failures})`);
  process.exit(1);
}
// ── 5. Documentation Sync Check ──────────────────────────────────────────────
// Before updating docs, ALWAYS read the actual source code to confirm the exact
// default values and logic. This check ensures docs match the actual source code.
function checkDocumentationSync() {
  const docFiles = [
    'CHANGELOG.md',
    'AI_QUICK_CONTEXT.md',
    'PROJECT_REFERENCE.md',
  ];
  
  // Check 1: weeklySmsEnabled default in SettingsContext.js must be false
  const settingsContext = fs.readFileSync(path.join(ROOT, 'src/store/SettingsContext.js'), 'utf8');
  const weeklySmsEnabledDefault = /weeklySmsEnabled:\s*(\w+)/.exec(settingsContext);
  if (weeklySmsEnabledDefault && weeklySmsEnabledDefault[1] !== 'false') {
    console.error('DOC SYNC FAIL: SettingsContext.js has weeklySmsEnabled default as ' + weeklySmsEnabledDefault[1] + ', expected false');
    return false;
  }
  
  // Check 2: normalizeContact must keep weeklyReminderEnabled strictly opt-in:
  // only a stored `true` survives, so old/null/undefined records load OFF.
  const contactsContext = fs.readFileSync(path.join(ROOT, 'src/store/ContactsContext.js'), 'utf8');
  if (!/weeklyReminderEnabled:\s*c\.weeklyReminderEnabled\s*===\s*true\b/.test(contactsContext)) {
    console.error('DOC SYNC FAIL: ContactsContext.js weeklyReminderEnabled must be strict opt-in (=== true)');
    return false;
  }
  
  // Check 3: the weekly time is chosen with the native CLOCK picker, not typed
  // free-text boxes, and weekday labels follow the app language.
  const settingsScreen = fs.readFileSync(path.join(ROOT, 'src/screens/SettingsScreen.js'), 'utf8');
  if (!settingsScreen.includes('DateTimePickerAndroid')) {
    console.error('DOC SYNC FAIL: SettingsScreen.js no longer uses DateTimePickerAndroid');
    return false;
  }
  if (!/mode:\s*'time'[\s\S]*display:\s*'clock'/.test(settingsScreen)) {
    console.error("DOC SYNC FAIL: SettingsScreen.js time picker must use display: 'clock'");
    return false;
  }
  if (/styles\.timeInput\b/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js still renders a free-text time input');
    return false;
  }
  if (!/\.map\(\s*\(day\)\s*=>\s*t\(day\)/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js weekday labels are not translated');
    return false;
  }
  if (/WEEKDAY_LABELS\[settings\.weeklyWeekday\]/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js weekday summary reads the stale saved value');
    return false;
  }
  
  // Check 4: CustomerDetailScreen must NOT have weeklyReminderEnabled toggle in profile view
  const customerDetail = fs.readFileSync(path.join(ROOT, 'src/screens/CustomerDetailScreen.js'), 'utf8');
  // Check for actual rendered weeklyReminderEnabled toggle (Switch with weeklyReminderEnabled)
  const hasWeeklyToggleInProfile = customerDetail.includes('weeklyReminderEnabled') && 
                                   customerDetail.includes('Switch') && 
                                   customerDetail.includes('weeklyReminderEnabled') &&
                                   customerDetail.includes('weeklyCard') &&
                                   customerDetail.includes('weeklyReminderEnabled !== false');
  if (hasWeeklyToggleInProfile) {
    console.error('DOC SYNC FAIL: CustomerDetailScreen.js still has weeklyReminderEnabled toggle in profile view');
    return false;
  }
  
  // Check 6: the weekly opt-in must be strict `=== true` everywhere, so an old
  // record without the field reads OFF and the switch can never look re-enabled.
  const formScreen = fs.readFileSync(path.join(ROOT, 'src/screens/CustomerFormScreen.js'), 'utf8');
  if (!/existing\.weeklyReminderEnabled\s*===\s*true\s*:\s*false/.test(formScreen)) {
    console.error('DOC SYNC FAIL: CustomerFormScreen.js weekly toggle must default OFF (=== true : false)');
    return false;
  }
  if (/existing\.weeklyReminderEnabled\s*!==\s*false/.test(formScreen)) {
    console.error('DOC SYNC FAIL: CustomerFormScreen.js still treats a missing weekly flag as ON');
    return false;
  }
  const weeklySync = fs.readFileSync(path.join(ROOT, 'src/components/WeeklyReminderSync.js'), 'utf8');
  if (!/weeklyReminderEnabled\s*===\s*true/.test(weeklySync)) {
    console.error('DOC SYNC FAIL: WeeklyReminderSync.js must gate on weeklyReminderEnabled === true');
    return false;
  }
  const smsModule = fs.readFileSync(
    path.join(ROOT, 'modules/sms-reader/android/src/main/java/expo/modules/smsreader/SmsReaderModule.kt'),
    'utf8',
  );
  if (!/optBoolean\("weeklyReminderEnabled",\s*false\)/.test(smsModule)) {
    console.error('DOC SYNC FAIL: SmsReaderModule.kt must default weeklyReminderEnabled to false');
    return false;
  }

  // Check 7: the weekly schedule must persist. The screen may not initialise
  // local state with `|| default` (kills Sunday / 00:xx), must re-sync from the
  // persisted settings, and must save the day/time the moment it is chosen.
  if (/Number\(settings\.weeklyWeekday\)\s*\|\|/.test(settingsScreen) ||
      /Number\(settings\.weeklyHour\)\s*\|\|/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js still falls back with `||`, discarding Sunday/00:xx');
    return false;
  }
  if (!/normalizeWeeklySchedule\(settings\)/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js must initialise weekly state via normalizeWeeklySchedule(settings)');
    return false;
  }
  if (!/useEffect\(\(\) => \{[\s\S]*?setWeeklyWeekday\(synced\.weekday\)[\s\S]*?\}, \[settings\.weeklyWeekday, settings\.weeklyHour, settings\.weeklyMinute\]\)/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js must re-sync weekly state when persisted settings change');
    return false;
  }
  if (!/const applyWeeklySchedule = \(patch\) => \{[\s\S]*?saveSettings\(\{[\s\S]*?weeklyWeekday: next\.weekday/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js must persist the weekly schedule immediately on change');
    return false;
  }
  if (/onPress=\{\(\) => setWeeklyWeekday\(index\)\}/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js weekday chip changes local state without persisting');
    return false;
  }
  if (/setWeeklyHour\(date\.getHours\(\)\)/.test(settingsScreen)) {
    console.error('DOC SYNC FAIL: SettingsScreen.js time picker changes local state without persisting');
    return false;
  }

  // Check 5: Documentation files must not say "Default: ON" or "default true" for weekly reminders
  const docFilesPaths = [
    path.join(ROOT, 'CHANGELOG.md'),
    path.join(ROOT, 'AI_QUICK_CONTEXT.md'),
    path.join(ROOT, 'PROJECT_REFERENCE.md'),
  ];
  
  for (const docFile of docFilesPaths) {
    if (fs.existsSync(docFile)) {
      const content = fs.readFileSync(docFile, 'utf8');
      // Check for incorrect defaults in docs
      if (content.includes('Default: ON') || content.includes('default true') || content.includes('default: true')) {
        if (content.includes('weekly') || content.includes('Weekly')) {
          console.error('DOC SYNC FAIL: ' + docFile + ' contains incorrect "Default: ON" or "default true" for weekly reminders');
          return false;
        }
      }
    }
  }
  
  return true;
}

// Before updating docs, ALWAYS read the actual source code to confirm the exact
// default values and logic. This check ensures docs match the actual source code.
if (!checkDocumentationSync()) {
  failures++;
  console.error('DOCUMENTATION SYNC FAILED - fix docs to match source code');
}

if (failures) {
  console.error(`\nFAILED (${failures})`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
