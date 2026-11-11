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
  'modules/sms-reader/index.js',
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
  'Uint8Array', 'TextEncoder', 'TextDecoder', 'RegExp', 'Intl',
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
    workflow.includes('eKhata-v${V}-${C}.apk'),
    'the CI APK is named with version + versionCode',
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

  console.log('unit checks: ok');
} catch (error) {
  failures++;
  console.error('UNIT FAIL: ' + error.message);
}

if (failures) {
  console.error(`\nFAILED (${failures})`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
