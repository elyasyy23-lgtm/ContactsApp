# TASK — ContactsApp / eKhata (Persian UI + Toman + auto SMS + Settings + Premium)

GOAL (v2 requirements, 2026-11-09): finish the eKhata-style customer-ledger app with
(1) 100% Persian UI, (2) Toman everywhere (no Rial), (3) automatic SMS reminder when a
customer's debt passes 1,000,000 Toman using the exact Persian template, (4) a Settings
screen (my name / card number / shop name) with SettingsProvider wrapping the
NavigationContainer (fixes "useSettings must be used inside SettingsProvider"),
(5) Premium screen with Myket/Cafe-Bazaar IAP placeholder, free plan capped at 10 customers.

STATUS: DONE 2026-11-09. All checks green, dev server running in tunnel mode.

## Batch 2 (2026-11-09) — UX + amount rule
GOAL: AmountSheet keyboard fix + no quick chips, long-press delete, and one shared
"under 1,000 = thousands" rule (manual entry AND bank SMS) so 308 → 308,000 everywhere.
- [x] AmountSheet: `KeyboardAvoidingView behavior={ios ? 'padding' : 'height'}` (save button
      stays above the keyboard); quick-amount chips + helpers + styles deleted; «تسویه کامل» kept.
- [x] AmountSheet: preview + submit go through `applyAmountRule`; muted note shows «۳۰۸ یعنی ۳۰۸٬۰۰۰».
- [x] CustomerDetailScreen: transaction rows have `onLongPress` → confirm Alert → delete that row.
- [x] format.js: `AMOUNT_RULE_THRESHOLD = 1000` + `applyAmountRule()` (idempotent).
- [x] smsParser.js: Rial → Toman (/10) then the rule; result exposes `rawToman` too.
- [x] SmsInboxContext: rule on ingest + on record; legacy pending items normalized on hydrate.
- [x] SmsImportScreen: correction field + result line use the rule.
- [x] ContactsContext: `normalizeTransaction` applies the rule → old rows stored as 308 self-heal.
- [x] verify.js: money(308000) = ۳۰۸٬۰۰۰, rule cases, 1,900,000 Rial → 190,000 Toman.
      `npm run verify` = 20/20 parse + unit checks ok; Metro Android bundle HTTP 200 (5.8 MB).

## Batch 3 (2026-11-09 v3) — owner reverted the ×1000 rule
GOAL: store and show exactly what is typed ("308" = 308 Toman, not 308,000).
- [x] Deleted `applyAmountRule` / `AMOUNT_RULE_THRESHOLD` from `format.js`.
- [x] Reverted all call sites: AmountSheet (preview + submit), SmsImportScreen (correction field
      + result line), smsParser (Rial ÷ 10 only), SmsInboxContext (ingest, record, pending),
      ContactsContext (`normalizeTransaction` stores the raw amount again).
- [x] verify.js now asserts the opposite: `parseAmount('308') === 308`, `money(308) = ۳۰۸`,
      9,000 Rial → 900 Toman, and `applyAmountRule` no longer exists.
      `npm run verify` = 20/20 + unit checks ok.
- NOTE: rows already written as 308000 by the old rule cannot be auto-detected; edit them once.

## Batch 4 (2026-11-09 v4) — one-SMS-per-debt reminder latch
GOAL: automatic reminder fires ONCE per debt crossing (balance > 1,000,000), resets when the
customer pays below it, and fires once more on the next crossing — never repeatedly.
- [x] `src/utils/reminderGate.js`: `REMINDER_THRESHOLD` + pure `reminderAction()` → send/reset/none.
      `theme.js` now re-exports the constant from here (one source of truth).
- [x] `ContactsContext`: `smsSentForCurrentDebt` on every customer + `setSmsSentForCurrentDebt()`
      (bails when unchanged), and `settleReminderLatch()` inside add/update/deleteTransaction so
      a payment (even one auto-imported from a bank SMS) clears the latch immediately.
- [x] `CustomerDetailScreen`: effect follows the gate, 900 ms debounce, `sendingRef` guards a
      double send; the latch is set only when the SMS composer actually opened; `firedRef` removed.
- [x] verify.js: gate cases + full lifecycle (send → silent → silent → reset → send → silent).
      `npm run verify` = 21/21 parse + unit checks ok; Metro Android bundle HTTP 200.

## Steps
- [x] Read the whole current source — stale English UI, broken imports (`rtl`, `toFa`,
      `amountRial`), no Settings screen, no SettingsProvider in App.js, no premium layer.
- [x] theme.js — `rtl`/`rtlCenter` aliases, Toman comments, FREE_CUSTOMER_LIMIT = 10
- [x] format.js — `toFa`/`toEn`, `money()` Persian + `٬`, `group()` stays Latin, Jalali/clock Persian digits
- [x] smsParser.js — `amountToman`, tolerant card mask (`*1234`), `buildReminder()` uses Persian amount
- [x] src/utils/billing.js — Myket IAP placeholder, bundle-safe (BILLING_READY = false)
- [x] src/store/PremiumContext.js — persisted premium state, buy/restore/unlock/lock, limit helpers
- [x] src/store/SettingsContext.js — kept (myName/cardNumber/shopName)
- [x] src/screens/SettingsScreen.js — three fields + card validation + live reminder preview + premium row
- [x] src/screens/PremiumScreen.js — Persian paywall, features, 99,000 Toman price, buy/restore/demo
- [x] HomeScreen — Persian, Toman, plan pill, FAB free-limit guard, settings entry
- [x] CustomerDetailScreen — Persian, auto SMS once per threshold crossing, reminder banner
- [x] CustomerFormScreen — Persian, free-limit guard, phone hint
- [x] SmsImportScreen — Persian, amountToman + Toman wording fixed
- [x] AmountSheet — Persian labels, Persian quick chips, Toman
- [x] ui.js — Persian-ready header (no `titleIsPersian` prop anymore)
- [x] App.js — SettingsProvider + PremiumProvider ABOVE NavigationContainer, Settings/Premium routes
- [x] scripts/verify.js + `npm run verify` — parse 17/17, no unbound ids, unit checks pass
- [x] Metro bundle HTTP 200 (1086 modules, ~5.98 MB)
- [x] `npx expo start --tunnel` restarted → exp://c-elyasyass-lktbd2-mw8rc8yoy9rqi8w7.on.expo.app
- [x] AGENTS.md updated + vault session note written

## Decisions
- Manual RTL only (`row-reverse` + `writingDirection:'rtl'`); no I18nManager reload dance.
- Money display = Persian digits + `٬`; stored/parsed values stay Latin numbers.
- Balance = credits − payments (positive = customer owes the shop). `@contacts_data` unchanged.
- Auto-reminder fires once per customer+amount; skipped when settings are incomplete
  (banner then routes to Settings); pending timer cleared on unmount.
- Native IAP libs break Expo Go → documented stub in `src/utils/billing.js` (same
  `{ ok, reason }` shape) + demo unlock so the premium flow is testable today.
- Free plan hard cap 10 customers (`FREE_CUSTOMER_LIMIT`), enforced in Home FAB and
  CustomerForm save; Premium state in `@premium_state`.

## NOW:
Delivered. Restart with `npx expo start --tunnel` if the tunnel URL changes (new random
subdomain each restart). Quick offline gate: `npm run verify`.

---

# TASK v3 — Automatic bank-SMS → payment recording (2026-11-09)

GOAL: read incoming bank SMS on the device, detect the amount + sender, find the
matching customer and record the deposit as a payment — automatically, including
while the app is closed. Expo Go cannot do this, so the deliverable is a native
module that activates in a real APK build.

## Steps
- [x] Question answered: native SMS BroadcastReceiver (dev build/APK) is the only
      reliable path; NotificationListener sees bank-app notifications only; a share
      target is manual-ish. Manual paste stays as fallback.
- [x] `modules/sms-reader` local Expo module: expo-module.config.json, build.gradle,
      AndroidManifest (RECEIVE_SMS/READ_SMS + SMS_RECEIVED receiver), SmsReaderModule.kt
      (getPending/clearPending/readInbox + onSmsReceived event), SmsReceiver.kt
      (multipart merge, dedupe, SharedPreferences queue capped at 100).
- [x] `modules/sms-reader/index.js` JS bridge — degrades to no-op when the native
      module is absent (Expo Go).
- [x] `src/utils/smsMatch.js` — card last-4 / full-name / partial-name matching,
      ignores the shop's own card, Persian digit + ی/ک normalization, dedupe key.
- [x] `src/store/SmsInboxContext.js` — hydrate, permission check, drain native queue +
      inbox backfill (6h first run), auto-record high confidence, persisted pending
      list (`@sms_pending_items`), seen keys, live event + AppState rescan.
- [x] Contacts: `cardNumber` field (optional) added to model + form.
- [x] Settings: "خواندن خودکار پیامک بانکی" card (status, enable/disable, pending
      link). Home: pending + auto-recorded banners. SmsImport: pending list with
      one-tap customer assignment.
- [x] app.json: `android.permissions = ["RECEIVE_SMS","READ_SMS"]`.
- [x] Verified: `npm run verify` 20/20 parse + unit checks (matcher cases incl.
      own-card exclusion); `npx expo-modules-autolinking resolve -p android` lists
      sms-reader; `npx expo prebuild -p android --no-install` succeeds; Metro bundle
      HTTP 200 with the new modules included.
- [ ] REAL DEVICE TEST — needs an APK build (no Android SDK/NDK on the phone and the
      git remote has no auth). Build on a PC: `npx expo run:android`, or `eas build
      -p android`, then grant the SMS permission from Settings.

## Decisions
- High confidence = saved card last-4 OR the customer's full name appears in the SMS;
  everything else goes to the pending list (never silently recorded).
- Personal (non-bank) SMS are dropped: a message must carry a bank name or a masked card.
- `READ_SMS` is optional: without it only new SMS are read (RECEIVE path).
- First scan looks back 6 hours; afterwards `@sms_last_scan` advances.

## Batch 5 (2026-11-09 v5) — SMS units, reminder wording, unit threshold
- [x] `parseBankSms`: Rial ÷ 10 → Toman, then ÷ `TOMAN_PER_UNIT` (1,000) → ledger units
      (`۱٬۹۰۰٬۰۰۰ ریال` → 190,000 Toman → stored `190`, same as typing 190). Returns
      `amount` (units) + `tomanAmount` (plain Toman) + `rawAmount`.
- [x] Customer attribution: `normalizeText` also folds ة/ۀ → ه, so «هانیة» matches
      «هانیه»; full-name/card matches still record as PAYMENT. Test added.
- [x] Reminder template: name line is «به نام: {myName}» from Settings (no placeholder
      ever existed in this source), plus the new line «لطفاً پس از واریز، تصویر رسید
      تراکنش را برای این شماره ارسال نمایید.» before the final thanks.
- [x] `REMINDER_THRESHOLD` = **1,000 ledger units** (× 1,000 = 1,000,000 Toman); banner
      shows the Toman equivalent via `TOMAN_PER_UNIT`.
- [x] Call sites moved to `item.amount` (pending items keep `amountToman` as a legacy
      fallback); Settings preview sample = 1,250 units.
- [x] Verified: `npm run verify` 21/21 parse + unit checks; Metro Android bundle 200.

## Batch 6 (2026-11-09 v6) — 7-day trial replaces the 10-customer free plan
- [x] `src/utils/trial.js` — pure trial math (`TRIAL_DAYS = 7`, `trialInfo(start, now)`,
      days rounded up, backwards clock clamped to the recorded start).
- [x] `PremiumContext` — persists `{ startedAt, lastSeenAt }` in `@premium_trial` on the
      first launch, 60s tick + AppState refresh, `lastSeenAt` written at most every 5 min
      and compared as `Math.max(now, lastSeenAt)` (clock rollback cannot reopen a trial).
      Exposes `trial`, `trialActive`, `trialDaysLeft`, `hasAccess`, `locked`,
      `debugShiftTrial` (dev only). `FREE_CUSTOMER_LIMIT` and `remaining()` are gone.
- [x] `App.js` — `RootNavigator` gates the whole app: when `locked`, the only screen in
      the stack is Premium (no back button); hydration waits before rendering.
- [x] `PremiumScreen` — shows days left during the trial, «دوره آزمایشی به پایان رسید»
      + locked card when it is over, trial note (7 روز، با نصب دوباره بازنشانی نمی‌شود),
      and a `__DEV__`-only "پایان دوره (تست)" button.
- [x] Home plan pill + FAB and CustomerForm save now use `locked`; Settings row shows the
      trial state.
- [x] `app.json` → `android.allowBackup: true` so Android Auto Backup restores the trial
      state after a reinstall (the only client-side mechanism; documented in AGENTS.md).
- [x] Verified: `npm run verify` 22/22 parse + trial unit checks; Metro bundle 200.

## Batch 7 (2026-11-09 v7) — customer categories (profiles)
- [x] `src/utils/profiles.js` — pure helpers: `PROFILE_NAME_MAX`, `cleanProfileName`
      (trim/collapse/cap), `profileNameKey`, `isDuplicateProfile` (unique names, rename
      allowed to itself), `profileCounts`, `contactsOfProfile` ('' = بدون دسته).
- [x] `src/store/ProfilesContext.js` — `useProfiles` + `@customer_profiles`; seeds
      «فروشگاه»/«شخصی» on first launch only; `addProfile`/`updateProfile` return
      `{ok, reason}` synchronously (duplicate re-checked inside the updater).
- [x] `src/utils/grouping.js` — `lettersOf` (only letters present, Persian order) and
      `letterBuckets` (sections); HomeScreen now uses `lettersOf` too.
- [x] `ContactsContext` — `profileId` in `normalizeContact` + `clearProfileFromContacts(id)`
      cascade (deleting a category never deletes customers).
- [x] `ProfilesScreen` — category list with counts + «بدون دسته» row; long-press edits.
- [x] `ProfileDetailScreen` — one category: dynamic letter chips, alphabetical sections,
      balance rows, FAB pre-filled with the category.
- [x] `ProfileFormScreen` — add / rename / delete (confirm + cascade), duplicate guard.
- [x] `CustomerFormScreen` — category chips picker (`profileId`, pre-selected when opened
      from a category), saved in the payload.
- [x] `CustomerDetailScreen` — category pill under the balance.
- [x] `HomeScreen` — «دسته‌های مشتری» row (names preview) → Profiles.
- [x] `App.js` — `ProfilesProvider` above `ContactsProvider`; screens `Profiles`,
      `ProfileDetail`, `ProfileForm` registered.
- [x] Verified: `npm run verify` 28/28 parse + profiles/grouping unit checks; Metro
      Android bundle 200 (6.09 MB, new screens present).

## Batch 8 (2026-11-10) — drawer navigation, debtors/report/calculator screens,
## call+SMS quick actions, backup & app lock
GOAL: right-side drawer (settings/categories/report/calculator entries), minimal
home header, full debtors screen, all-customers CSV report, financial calculator,
call/SMS buttons on customer detail, and a Settings "پشتیبان‌گیری و داده‌ها" section
(JSON backup / restore / CSV / clear-all) + biometric app lock.
- [x] Deps: `expo-file-system`, `expo-sharing`, `expo-document-picker`,
      `expo-local-authentication` (npx expo install); app.json →
      `"plugins": ["expo-sharing"]`; version → 1.1.0.
- [x] `src/utils/calc.js` — tokenizer + recursive-descent parser, phone-percent
      semantics (200+10%→220, 200×10%→20), Persian display formatting.
- [x] `src/utils/backup.js` — buildBackup/parseBackup (accepts full payload OR
      legacy bare contacts array, returns {ok,reason})/toCsv (BOM, totals row)/
      backupFileName.
- [x] `src/utils/exports.js` — exportBackup/exportCsv (cache file → share sheet →
      delete) + pickBackupFile (DocumentPicker). No direct Download-folder write:
      scoped storage only exposes cache/document/bundle paths.
- [x] ContactsContext `importContacts(list)` bulk-replace (also used by clear-all);
      ProfilesContext `importProfiles(list)`; SettingsContext `appLock: false`.
- [x] Screens: DebtorsScreen (letter chips + totals), ReportScreen (credit/payment/
      net + CSV share), CalculatorScreen (button grid only, ASCII expr internally,
      Persian render), LockScreen (expo-local-authentication, auto-attempt).
- [x] `src/components/AppDrawer.js` — right drawer: gradient header, live debtors
      card (count + receivable total), trial row, menu (home/settings/categories/
      report/calculator/sms imports). Routes via
      `navigate('MainStack', { screen })`.
- [x] App.js — GestureHandlerRootView > SafeArea > Settings > Premium > Profiles >
      Contacts > SmsInbox; DrawerShell (drawerPosition right, type front,
      swipeEnabled false — never fights Android back gesture); LockGate wraps
      DrawerShell INSIDE NavigationContainer (AppState background re-locks,
      in-memory unlock ref). Trial gate unchanged.
- [x] HomeScreen — minimal header (hamburger + shop name + search), removed
      summary cards + categories row + premium row (moved into drawer);
      search matches name/phone/cardNumber.
- [x] CustomerDetail — تماس/پیامک quick actions (`Linking.openURL('tel:'/'sms:')`,
      no canOpenURL — Android 11 package visibility, just try + catch).
- [x] SettingsScreen — Backup & Data card (4 DataRow buttons) + App Lock switch
      row (hasHardwareAsync + isEnrolledAsync guards). Restore brings back
      contacts/profiles/myName/cardNumber/shopName but NEVER appLock (belongs to
      the phone's owner, not the backup).
- [x] verify.js — calc engine cases (percent rule, div-by-zero, Persian digits,
      float-noise) + backup round-trip (own payload, legacy array, bad json,
      bad shape, CSV BOM/totals/net math). Caught + fixed: formatCalcResult
      wasn't converting digits to Persian.
- [x] Verified: `npm run verify` 36/36 parse + unit checks ALL PASS; Metro
      Android bundle HTTP 200 (~9.83 MB), all new markers present in bundle
      (AppDrawer/Debtors/Calculator/LockScreen/ekhata-backup/Persian labels).

## NOW:
Batch 8 shipped (drawer + debtors + report + calculator + call/SMS + backup +
app lock). v5–v8 pushed to GitHub (2026-11-10, this commit) → the Actions
"Build APK" workflow is the delivery path (EAS upload stays geo-blocked).
Remaining: tap through on the phone (Expo Go `--tunnel` or the Actions APK),
then the real Myket IAP SDK in a dev build. Real-device notes: biometric lock +
file sharing + document picker confirmed only on an APK; Expo Go degrades
gracefully (LocalAuthentication not enrolled → toggle shows a message).
