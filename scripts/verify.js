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

try {
  assert.strictEqual(fmt.group(1234567), '1,234,567', 'group() stays Latin');
  assert.strictEqual(fmt.money(1234567), '۱٬۲۳۴٬۵۶۷', 'money() is Persian + ٬');
  assert.strictEqual(fmt.toFa('2026'), '۲۰۲۶');
  assert.strictEqual(fmt.toEn('۲۰۲۶'), '2026');
  assert.strictEqual(fmt.parseAmount('۱٬۲۵۰٬۰۰۰'), 1250000);
  assert.strictEqual(fmt.parseAmount('1,250,000'), 1250000);
  assert.strictEqual(fmt.groupCard('6037997412345678'), '6037 9974 1234 5678');

  const rial = sms.parseBankSms('مبلغ 12,500,000 ریال واریز به حساب شما، کارت *1234، بانک ملت');
  assert.strictEqual(rial.ok, true);
  assert.strictEqual(rial.amountToman, 1250000, 'Rial SMS → Toman');
  assert.strictEqual(rial.bank, 'ملت');
  assert.strictEqual(rial.card, '1234');

  const toman = sms.parseBankSms('برداشت 250,000 تومان از حساب شما');
  assert.strictEqual(toman.amountToman, 250000);
  assert.strictEqual(toman.direction, 'out');

  const reminder = sms.buildReminder({
    customerName: 'علی رضایی',
    amountToman: 1250000,
    cardNumber: '6037997412345678',
    myName: 'محمد احمدی',
  });
  const expected = [
    'علی رضایی عزیز،',
    'یادآوری می‌شود موجودی بدهی شما ۱٬۲۵۰٬۰۰۰ تومان می‌باشد.',
    'جهت تسویه، لطفاً مبلغ را به شماره کارت زیر واریز نمایید:',
    '6037 9974 1234 5678',
    'به نام: محمد احمدی',
    'با تشکر از همکاری شما',
  ].join('\n');
  assert.strictEqual(reminder, expected, 'reminder template must stay verbatim');

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
