# TASK — ContactsApp / eKhata (Persian UI + Toman + auto SMS + Settings + Premium)

## CURRENT TASK (2026-11-20) — CCTV v1.5.1 release, Expo Go gate pending

GOAL: ship the verified CCTV archive-playback work as ContactsApp v1.5.1 / code 13 ONLY
after the owner explicitly confirms the Expo Go test of candidate `1` = `archive-local`.
Local work is complete; do NOT bump version, push, tag, or build APK until the gate is
cleared in writing.

STATUS 2026-11-20:
- Owner replied `1` — recorded as CCTV candidate `1` = `archive-local` (vault note written).
- Project `AGENTS.md` still records the Expo Go gate as pending; the `1` reply selected the
  candidate, it did NOT prove the test passed.
- Verified locally: `npm run verify` 53/53 + ALL CHECKS PASSED; forbidden-hook scan 0;
  Metro 8082 warm Android dev bundle 10,085,987 B with all CCTV tokens.
- Release plan (after confirmation): bump `app.json` 1.5.0→1.5.1 / code 12→13, commit+push
  `main`, tag `v1.5.1`, watch CI, deliver `HesabYar-release.apk` via `~/gh-release-download.sh`
  to Download, then bump central `ContactsApp/version.json` to 1.5.1 and revalidate live.
- No version bump, commit, push, tag, CI build, or APK delivery has been done yet.

### Historical phased diagnostics goal (2026-11-19, COMPLETE)
GOAL: finish a local, sanitized CCTV/DVR diagnostics log + Persian RTL screen named
«گزارش و عیب‌یابی دوربین» in 8 independently verifiable phases. Work ONE phase at a
time; after each phase inspect the actual Git diff, run the relevant tests, report exactly
what changed/verified, and STOP before the next phase. No APK/push/tag/CI without approval.

### Phase checklist
- [x] Phase 1 — re-scope existing diagnostics helpers/context to CCTV-only; narrow storage key
      and sections; CCTV-named provider/hooks; App.js import cleanup; inspect diff; verify.
- [x] Phase 2 — `src/screens/CctvDiagnosticsScreen.js`: Persian RTL severity filter, empty state,
      error styling, exact actions «کپی همه لاگ‌ها» / «کپی خطاها» / «پاک کردن لاگ‌ها» with
      clear-confirm, using `useCctvDiagnostics()` / `useCctvDiagnosticsActions()`.
- [x] Phase 3 — wire `CctvDiagnosticsProvider` around the app and add the stack route to
      `CctvDiagnosticsScreen`; no global/unexpected JS error logging. Drawer entry is Phase 4.
- [x] Phase 4 — drawer entry «گزارش و عیب‌یابی دوربین» + i18n mappings in `src/i18n/dict.js`.
- [x] Phase 5 — instrument ONLY CCTV/DVR events: connection test success/failure, playback
      start/failure, archive errors, invalid DVR settings/config, relevant player errors.
- [x] Phase 6 — extend `scripts/verify.js` with CCTV diagnostics/sanitization/storage-cap/
      stable-actions/static-instrumentation assertions.
- [x] Phase 7 — full verification: `npm run verify`; restart ContactsApp Metro on port 8082
      only (PID-targeted; never touch HayatAlSahabah on 8081); Android dev bundle 200.
- [x] Phase 8 — update `TASK.md` status + final report; hand off `exp://127.0.0.1:8082` and
      WAIT for the owner's explicit Expo Go confirmation (no push/tag/CI/APK).

### Decisions / constraints (owner order)
- Owner narrowed scope to CCTV/DVR only. Do NOT instrument SMS/transactions/customers/
  reminders/app-wide errors, and do NOT build a broad «گزارش و عیب‌یابی» section.
- Existing general diagnostics code is reusable ONLY for CCTV logging; keep names/imports
  explicit and CCTV-specific. Preserve all unrelated uncommitted work.
- Do not change playback timing; do not invent DVR CGI commands.
- Never log passwords, RTSP URLs/credentials, customer names/phones, card/financial data.
- Keep ALL existing app features and user data; package ID unchanged.
- One phase at a time: real code changes → actual diff inspection → tests → report → STOP.
- Expo Go gate: ContactsApp Metro on 8082 only; no APK/push/tag/CI until owner confirms.
- `scripts/verify.js` still mentions port 8081 in its header — ignore it; owner rule is 8082.

### Phase 1 verification (2026-11-19)
- `src/utils/diagnostics.js`:
  - header = CCTV/DVR-only; storage key `@cctv_diagnostics_log_v1`;
  - `CCTV_LOG_SECTIONS = cctv/settings/playback`; broad `LOG_SECTIONS` removed;
  - `normalizeLogSection()` maps broad legacy section names to `cctv`.
- `src/store/DiagnosticsContext.js`:
  - `CctvDiagnosticsProvider`, `CctvDiagnosticsContext`, `CctvDiagnosticsActionsContext`,
    `useCctvDiagnostics`, `useCctvDiagnosticsActions`;
  - `clearedRef` durable clear-before-hydration fix kept; no `logDebug` action.
- `App.js`: imports `CctvDiagnosticsProvider` and `CctvDiagnosticsScreen`; removed unused
  `LOG_SECTIONS`; existing `CctvPlayer` route preserved; no global instrumentation added.
- No stale `DiagnosticsProvider` / `useDiagnostics` / `LOG_SECTIONS` /
  `@diagnostics_log_v1` references found in JS/JSON source.
- `npm run verify` → `parse: 52/52 files ok`, `unbound identifiers: checked`,
  `unit checks: ok`, `ALL CHECKS PASSED`.
- Targeted hook harness (outside repo):
  `/data/data/com.termux/files/usr/tmp/zyvo/phase1-diagnostics-harness.cjs`
  → `11/11 pass` (five stable action identities, clear-before-hydration, storage removal,
  post-clear logging/persistence, no-throw storage failure, CCTV section normalization).
  Run with `NODE_PATH=/data/data/com.termux/files/home/ContactsApp/node_modules`.
- Actual diff inspected: `git status --short`, `git diff -- App.js`,
  `git diff --no-index /dev/null src/utils/diagnostics.js`,
  `git diff --no-index /dev/null src/store/DiagnosticsContext.js`.

### Dependencies
- Phase 2 needs Phase 1 actions. Phase 3 needs Phase 2 screen. Phase 4 needs Phase 3.
- Phase 5 needs Phases 1–3. Phase 6 needs Phases 1–5. Phase 7 needs Phases 1–6.
- Phase 8 is the final report after Phase 7 verification.

### Phase 2 verification (2026-11-19)
- `src/screens/CctvDiagnosticsScreen.js` created (new file, 359 lines); actual diff inspected with
  `git diff --no-index -- /dev/null src/screens/CctvDiagnosticsScreen.js`.
- Screen uses `useCctvDiagnostics()` / `useCctvDiagnosticsActions()`, `useLang()`, `filterLogs()`,
  severity filter, empty/loading states, error styling, manual RTL (`row-reverse` + `rtl` /
  `rtlCenter`), and exact actions «کپی همه لاگ‌ها» / «کپی خطاها» / «پاک کردن لاگ‌ها» with
  clear-confirm «همه لاگ‌های دوربین پاک می‌شوند. ادامه میدهید؟».
- Malformed mixed-script strings removed; grep found no `خلاصه報告`, `نمایش_data`, or
  `لاگ的记录`; only clean title/action matches remain.
- `npm run verify` → `parse: 53/53 files ok`, `unbound identifiers: checked`,
  `unit checks: ok`, `ALL CHECKS PASSED`.
- No full Metro bundle check yet (Phase 7 only). No APK/push/tag/CI. STOP before Phase 3.
- NOTE: provider/stack/drawer code for later phases is already present in the working tree but is
  deliberately NOT checked off or reported until each phase gets its own diff inspection + tests.

### Phase 3 verification (2026-11-19)
- Actual diff inspected: `git diff -- App.js` (+ `git status --short`). Diff is exactly three
  hunks: import of `CctvDiagnosticsProvider`, imports of `CctvPlayerScreen` +
  `CctvDiagnosticsScreen`, two `<Stack.Screen>` registrations, and the provider wrapper.
- `App.js` structure confirmed:
  - `CctvDiagnosticsProvider` wraps `<StatusBar style="light" />` + `<RootNavigator />` +
    `<UpdateNotice />` INSIDE `SmsInboxProvider` (so the provider is mounted for every route);
  - `<Stack.Screen name="CctvPlayer" component={CctvPlayerScreen} />` preserved;
  - `<Stack.Screen name="CctvDiagnostics" component={CctvDiagnosticsScreen} />` added in
    `MainStack`, directly after `CctvPlayer`, before `CustomerForm`.
- No global/unexpected JS error logging added: grep for
  `ErrorUtils|setGlobalHandler|global.Error|unhandledrejection|onerror|console.error` across
  `App.js`, `src/store/DiagnosticsContext.js`, `src/utils/diagnostics.js`,
  `src/screens/CctvDiagnosticsScreen.js` → zero matches.
- No changes to playback timing, DVR commands, navigation params, SMS/ledger flows, or
  existing screens besides the two `Stack.Screen` lines.
- `npm run verify` → `parse: 53/53 files ok`, `unbound identifiers: checked`,
  `unit checks: ok`, `ALL CHECKS PASSED`.
- No full Metro bundle check yet (Phase 7 only). No APK/push/tag/CI. STOP before Phase 4.

### Phase 4 verification (2026-11-19)
- `src/components/AppDrawer.js` — exactly ONE new `MenuItem` (5 added lines, no other change):
  `icon="bug-outline"`, `label={t('گزارش و عیب‌یابی دوربین')}`,
  `onPress={() => go('CctvDiagnostics')}`. Placed after «پیامک‌های بانکی», before the divider.
- Navigation pattern reused, not reinvented: `go(screen)` already calls
  `navigation.navigate('MainStack', { screen })` — the same helper every other drawer row uses
  (stack name is load-bearing). No new drawer/navigation code, no duplicate entry
  (`grep -c "CctvDiagnostics" src/components/AppDrawer.js` = 1).
- `src/i18n/dict.js` — 27 English mappings appended as a `// ── CCTV diagnostics ──` block inside
  the existing `Object.assign(en, { … })` section, single-quote style preserved, +77 lines total,
  zero modifications to existing keys. Covers every literal used by
  `src/screens/CctvDiagnosticsScreen.js` (title «گزارش و عیب‌یابی دوربین» → `Camera diagnostics`,
  section labels, severity filter Info/Warning/Error, the exact actions «کپی همه لاگ‌ها» /
  «کپی خطاها» / «پاک کردن لاگ‌ها», the clear confirm, empty states, footer note) plus the two
  copy-result alerts.
- Coverage measured: 29 distinct `t()` literals in the screen → **0 missing** in dict.
- Actual diff inspected: `git diff -- src/components/AppDrawer.js` (+5 only) and
  `git diff -- src/i18n/dict.js` (additions only, `git diff --stat` = 5 + 77 lines).
- No changes to CCTV playback, diagnostics logic, SMS, customers, transactions, reminders,
  `App.js`, or any existing i18n key. No global error logging or new instrumentation.
- `npm run verify` → `parse: 53/53 files ok`, `unbound identifiers: checked`,
  `unit checks: ok`, `ALL CHECKS PASSED`.
- No Metro bundle yet (Phase 7), no APK/push/tag/CI, port 8081 untouched. STOP before Phase 5.

### Blockers
- `src/screens/CctvDiagnosticsScreen.js` now exists; full Metro bundle is deferred to Phase 7.
  Do NOT run the dev bundle until Phases 3-6 land.
- `src/store/DiagnosticsContext.js`, `src/utils/diagnostics.js`, and
  `src/screens/CctvDiagnosticsScreen.js` are untracked, so use
  `git diff --no-index /dev/null <file>` to inspect their diff.

### Phase 5 — CCTV/DVR instrumentation (DONE 2026-11-19, awaiting Phase 6)
Files touched (nothing else): `src/screens/CctvPlayerScreen.js`,
`src/screens/SettingsScreen.js`, `src/screens/CustomerDetailScreen.js`.
22 log call sites across the 7 owner-approved event points:
1. DVR settings save (SettingsScreen) — saved INFO / invalid IP, invalid port ERROR.
2. «Test TV Playback» (SettingsScreen) — invalid IP/port ERROR, unbuildable URL ERROR,
   test start INFO, success INFO (HTTP status), not-configured WARNING, HTTP/network ERROR.
3. TV trigger auto-send (CctvPlayerScreen `sendToTv`) — start INFO, sent INFO, not-configured
   WARNING, failure ERROR.
4. Copy RTSP link (CctvPlayerScreen `copyRtsp`) — success INFO / failure ERROR.
5. Open external player (CctvPlayerScreen `openExternal`) — handoff INFO / open failure ERROR.
6. Per-transaction camera tap (CustomerDetailScreen `openTransactionCctv`) — open INFO,
   invalid transaction time WARNING.
7. Player session end (CctvPlayerScreen unmount, one-shot ref) — «جلسهٔ پخش آرشیو بسته شد» INFO.
Sanitization: every detail string is a fixed Persian phrase or an HTTP status / reason code —
no password, no RTSP URL, no customer name, no phone, no card/financial data. RTSP generation,
VLC handoff, playback logic, dependencies and unrelated features untouched.
Evidence: `npm run verify` → parse 53/53, unit checks ok, ALL CHECKS PASSED; forbidden global
hooks scan (`ErrorUtils|setGlobalHandler|global.Error|unhandledrejection|onerror|console.error`)
= 0; Metro restarted PID-targeted on 8082 only (8081 stayed 200 the whole time); warm Android
dev bundle HTTP 200 / 10,065,726 B; served bundle carries `useCctvDiagnosticsActions` ×13,
`CCTV_LOG_SECTIONS` ×29, `logWarning` ×13, `transactionTimestamp` ×4 and all 7 new Persian
log strings (1 literal hit each).

NOW: Phase 5 VERIFIED and STOPPED. Next only after owner continuation: Phase 6 — extend
`scripts/verify.js` with CCTV diagnostics unit asserts (sanitization, storage cap, stable
actions, static instrumentation coverage). No APK/push/tag/CI.

## ARCHIVE — CCTV black-screen investigation + broad diagnostics pass (superseded by the phased plan above)
GOAL: find why the CCTV archive player is black (XMEye works, generated RTSP failed in VLC), add safe diagnostics logs and a Persian RTL «گزارش و عیب‌یابی» drawer screen with filters/copy/clear + persistent local storage, verify, and hand off for Expo Go. NO APK/push/tag/build without approval.
- [x] 1. Inspect exact generated URL inputs (`rtsp.js`, settings, CctvPlayerScreen) and current player capability.
- [x] 2. Research XMEye/Xiongmai RTSP archive syntax (host/port/channel/subtype/time params) against owner facts; document what is confirmed vs unverified.
- [ ] 3. Add pure sanitizing diagnostics module + persistent local log store with max size.
- [ ] 4. Instrument CCTV, SMS, transactions, customers, reminders, app errors with safe INFO/WARNING/ERROR events.
- [ ] 5. Add Persian RTL Diagnostics screen with section/level filters, copy-all/copy-errors/clear-confirm, empty state.
- [ ] 6. Register drawer entry «گزارش و عیب‌یابی» + i18n mappings + verify assertions.
- [ ] 7. Run `npm run verify`, Android Metro bundle check, report changed files/results/limitations.
DECISIONS: do not change playback timing; do not invent DVR CGI commands; never log passwords, card numbers, customer names/phones, or credentials-bearing URLs; keep all existing features/data.
NOW: implementing step 3 — add the pure sanitizing diagnostics module + local persistent store, then instrument CCTV/SMS/transactions/customers/reminders/errors. Research result: XM RTSP is on port 554, native live form is `.../user=...&password=...&channel=1&stream=0.sdp?real_stream`; no confirmed XM RTSP archive `starttime/endtime` support; real archive playback uses DVRIP `OPFileQuery`/`OPPlayBack`. Current black screen also has no native decoder in `CctvPlayerScreen`.

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

## Batch 9 (2026-11-10) — silent background SMS sending
GOAL: the auto reminder sends WITHOUT opening the messaging app or pressing
Send — true SmsManager background send. (Before: `sms:` URL opened the
composer and the owner pressed Send.)
- [x] Kotlin `SmsReaderModule`: `sendSms(destination, body)` →
      checkSelfPermission(SEND_SMS) guard, `getSystemService(SmsManager)`
      + divideMessage/sendMultipartTextMessage (Persian = UCS-2, ~70
      chars/segment — always multipart for the reminder template), returns
      `{ok, reason}` maps; `hasSendSmsPermission()` helper.
- [x] Manifest + app.json: SEND_SMS added to both; version → 1.2.0.
- [x] `modules/sms-reader/index.js`: `sendSmsNative` + `hasSendSmsPermission`
      (never throw, Expo Go → `{ok:false, reason:'unavailable'}`).
- [x] `src/utils/smsSend.js` (NEW): `sendSilently(phone, body)` transport
      ladder — cleanSmsPhone → PermissionsAndroid.request(SEND_SMS) (one-time
      dialog, instant when granted) → native send. `silentSmsAvailable`
      flag. Persian-digit-only phones → 'destination' (cannot dial).
- [x] `reminderGate.js`: `dueReminderContacts(contacts, {settingsReady,
      balanceOf})` pure selector (balanceOf passed IN so the module stays
      Node-importable for verify.js; the real one comes from ContactsContext).
- [x] `SettingsContext`: `reminderAutoSend` (default ON, old stored settings
      default to ON too).
- [x] **HomeScreen sweep = the ONLY auto-sender** (runs on mount, on
      contacts/settings change, and on AppState 'active'): sends one silent
      SMS per due customer, 1.2s pacing between sends, latches each success,
      breaks on 'permission'/'unavailable', green banner «پیامک یادآوری برای
      n مشتری بدهکار ارسال شد», one-time Alert routing to Android settings
      when SEND_SMS is denied. CustomerDetailScreen's auto effect now SKIPS
      its composer timer when silent sending is possible (single code path —
      no double-fire); the composer timer stays as the Expo Go/switched-off
      fallback.
- [x] `CustomerDetailScreen.sendReminder`: silent-first (native → latch +
      «ارسال شد» alert on manual path), composer fallback when silent fails.
- [x] SettingsScreen: «ارسال خودکار یادآوری» Switch row (paper-plane icon).
- [x] verify.js: 7 new assertions for dueReminderContacts (due/latched/
      below/no-phone/Persian-digit phone/settings-not-ready/missing
      balanceOf/garbage input). 37/37 files.
- [x] Verified: `npm run verify` ALL PASS; Metro cold bundle (cache cleared)
      HTTP 200 (~9.84 MB) with sendSms/bridge/selector/toggle/banner present
      (Persian strings appear as \uXXXX escapes in the bundle — grep traps).
      PITFALL hit: Metro served a STALE SettingsScreen transform while other
      files were fresh — fixed by `rm -rf node_modules/.cache` + restart.

## NOW:
v11 shipped + verified on device (commit c6264cd). Working on Batch 10 (v12):
share + language/date switch, clickable green banner modal, Home swipe
navigation. See "Batch 10" below.

## Batch 5 (2026-11-10 v10) — AUTOMATIC reminder inside the transaction save
GOAL (owner spec): the moment a transaction is saved and the debt goes above
1,000 units (1,000,000 Toman), the silent SMS must go out by itself — no button.
Reset rules: once per crossing; a payment to/≤ 1,000 resets the latch; the next
crossing sends exactly one more.
- [x] `src/utils/reminderAuto.js` — `autoSendReminder()`: silent-only (no Alert,
      no composer), latches ONLY on a successful send, `inFlight` Set blocks a
      duplicate while a send is pending, respects `reminderEnabled` + shop
      details + a usable phone.
- [x] `ContactsContext` rewritten around `contactsRef` + `commit(next)` so a
      mutation knows the new balance synchronously; `fireAutoReminder(updated)`
      is called from `addTransaction`, `updateTransaction`, `deleteTransaction`.
- [x] `settleReminderLatch` still resets the latch on every mutation when the
      debt returns to/≤ the threshold (bank-SMS payments included).
- [x] Manual buttons kept as a FALLBACK only (Expo Go / denied SEND_SMS / switch
      turned on late) — the automatic path never depends on them.
- [x] `scripts/verify.js`: owner scenario step-by-step + static guards (3 trigger
      call sites, no Alert/Linking in the auto sender, `reminderEnabled` check).
      `npm run verify` = 39/39 files ok, unit checks ok; Metro bundle 200 with
      `fireAutoReminder`/`autoSendReminder` present.
- [ ] APK build + on-device test: save a credit crossing 1,000 → SMS leaves with
      no composer; pay below → save credit again → exactly one more SMS.

## Batch 10 (2026-11-11 v12) — share + language switch, banner modal, swipe filter
GOAL (owner spec, 3 features):
1. Share: a Share button in Settings to share the app with others; a
   per-transaction receipt share on the customer page (Android share sheet).
2. Language switch: Persian (Jalali dates) ⇄ English (Gregorian dates) in
   Settings — UI text + dates/digits follow the language, layout stays RTL.
3. Green banner: tapping «… واریز بانکی خودکار ثبت شد» opens a modal with the
   auto-recorded deposits (customer name, amount in Toman, date/time, SMS
   text); closing the modal clears the banner.
4. Home swipe: swipe left/right on the customer list steps the letter filter
   to next/previous letter and auto-scrolls the chips bar.
- [ ] `src/i18n/index.js` — EN dictionary keyed by the Persian source strings
      (fa stays the literal key → zero regression on the Persian UI) +
      `translate(key, params)` with module-level lang.
- [ ] `src/i18n/LanguageContext.js` — LanguageProvider (outermost in App.js),
      persists `@app_language`, syncs format.js locale; `useLang()` →
      `{ lang, setLang, t }`.
- [ ] `format.js`: `setLocale/getLocale/digits`; locale-aware `money`,
      `jalaliDate` (Gregorian YYYY/MM/DD in en), `clockTime`. Default 'fa'
      so Node verify tests stay green.
- [ ] i18n sweep: all 13 screens + AmountSheet + AppDrawer + LockScreen +
      reminderSend alerts via `t(...)`.
- [ ] SettingsScreen: language segmented control (فارسی/English) + Share-app
      button (Share.share with app info + repo link).
- [ ] CustomerDetailScreen: share icon per transaction row → receipt text
      (name, type, amount in Toman, date/time, note, balance).
- [ ] SmsInboxContext: recentAuto entries gain contactId/bank/body/smsAt.
- [ ] HomeScreen: banner → modal (details + clear-on-close) + amount shown in
      real Toman (×TOMAN_PER_UNIT); RNGH Pan gesture (activeOffsetX ±20,
      failOffsetY ±25) steps the letter filter; chips auto-scroll.
- [ ] app.json 1.4.0 / versionCode 11; verify.js gains: every t('…') key has
      an EN entry; locale unit checks (en money/date).
- [ ] npm run verify + Metro bundle 200 → commit feat(v12) → push → CI green
      → APK artifact eKhata-v1.4.0-11.

## Batch 15 (2026-11-18, v1.5.0) — in-app update checker + public release + rebranded build

GOAL: ship v1.5.0 (rebrand حسابیار + manual SMS sender exclusion + in-app update
notification), honouring the owner's permanent APK build rules (GitHub-first download,
mirror fallback, size/hash gate, save to `/storage/emulated/0/Download/`, update notice).

- [x] `src/utils/updateCheck.js` — `UPDATE_MANIFEST_URL`
      (`https://elyasyy23-lgtm.github.io/elyasyy-apps/ContactsApp/version.json`),
      pure `parseVersion` / `isNewer` / `fetchUpdateManifest` (8 s AbortController,
      `?t=` cache-buster, never throws → null).
- [x] `src/components/UpdateNotice.js` — Persian modal card, Persian alert text
      «نسخه جدید برنامه منتشر شده است. لطفاً برای دریافت آخرین امکانات، برنامه را بروزرسانی کنید.»
      + «بروزرسانی» (opens download page) / «بعداً»; mounted as a sibling of `RootNavigator`.
- [x] `App.js` — `<UpdateNotice />` mounted inside `SmsInboxProvider`.
- [x] `src/i18n/dict.js` — 3 new keys (بروزرسانی برنامه / full alert / بروزرسانی).
- [x] `scripts/verify.js` — `AbortController` in `JS_GLOBALS`; 12 update-check unit asserts
      + mount assert; workflow-name assert updated to `HesabYar-v${V}-${C}.apk`.
      `npm run verify` → 47/47 files, ALL CHECKS PASSED.
- [x] `.github/workflows/build.yml` — `permissions: contents: write`; versioned artifact
      `HesabYar-v<ver>-<code>.apk` + STABLE release asset `HesabYar-release.apk`;
      `softprops/action-gh-release@v2` publishes on a `v*` tag.
- [x] Bundle gate: `npx expo export --platform android --no-bytecode` → 3.1 MB, contains
      the manifest URL, `cloud-download-outline`, exclusion filter, fa+en update strings.
- [x] Metro (localhost) running → `exp://127.0.0.1:8081`; warm dev bundle 200 / 9.96 MB.
- [x] OWNER EXPO GO TEST (gate) — confirmed; release build authorized.
- [x] Bump `app.json` 1.4.0 → 1.5.0, versionCode 11 → 12.
- [x] Commit `7bf01a5` + push `main`, tag `v1.5.0`, push tag → CI run `44339886541` SUCCESS,
      Release `v1.5.0` published (`HesabYar-release.apk` 49155385 B, sha256 `a456...9882`).
- [x] `~/watch-contacts.sh` (calls `~/gh-release-download.sh`) → APK saved to
      `/storage/emulated/0/Download/HesabYar-release.apk`, digest verified byte-for-byte.
- [x] Website: `elyasyy-apps/ContactsApp/version.json` (latestVersion 1.5.0) +
      `contactsapp.html` detail page + `assets/hesabyar-icon.png` + mirrored
      `HesabYar-release.apk` at repo root + `index.html` HesabYar `.apptile` card +
      `sitemap.xml` entry. Originally published as commit `7ab0ca7` on `main` (FocusBlocker);
      migrated 2026-11-20 to `elyasyy-apps` Pages; old FocusBlocker URLs redirect.
- [x] LIVE verified: `contactsapp.html` 200, `HesabYar-release.apk` content-length
      49155385, `ContactsApp/version.json` 200, icon 200, sitemap + index carry the app;
      live APK head+tail 256 KB hashes match the local verified file (byte-identical).

NOW: v1.5.0 fully shipped — app + Release + Pages site + in-app update checker live.
NEXT (owner): on-device check of the exclusion UI + update notice on the next release.

---

# TASK v1.6 WIP — CCTV archive playback (2026-11-19, owner request)

GOAL: add an incremental CCTV archive playback feature for the owner's generic
Chinese/XMEye/Xiongmai (XM) DVR on the same LAN, using archived RTSP only and
a modular configurable TV trigger. Do NOT change SMS, ledger, navigation,
existing i18n keys, or existing UI behaviour. Keep version 1.5.0 during WIP.

## Known DVR facts
- Serial `292c3e41a34907d9`; system `V4.03.R11`; MAC `001241b568ee`.
- Owner-entered local IP, port `34567`, username `admin`.
- RTSP archive template:
  `rtsp://[User]:[Pass]@[IP]:[Port]/cam/realmonitor?channel=1&subtype=0&starttime=[YYYYMMDDThhmmssZ]&endtime=[YYYYMMDDThhmmssZ]`.
- Start time = transaction timestamp minus 5 minutes. End time/duration must be configurable.
- TV CGI endpoint/payload is unknown; keep it configurable in code.

## Steps
- [x] Read `AGENTS.md`, current tree state, `SettingsContext`, `SettingsScreen`,
      `CustomerDetailScreen`, `App.js`, i18n/format/theme/UI helpers, verify script.
- [x] Inspect Expo Video SDK 58 docs; no RTSP support found in cached docs; native
      RTSP playback may not work in Expo Go.
- [x] Add DVR fields to `src/store/SettingsContext.js` (`@settings_data`) and
      normalize them safely: `dvrIp`, `dvrPort`, `dvrUser`, `dvrPassword`, `dvrSerial`.
- [x] Add Persian RTL Settings section with the 5 fields + exact button `Test TV Playback`.
- [x] Add `src/utils/rtsp.js` (URL builder, timestamp formatting, timestamp − 5 min)
      and `src/utils/tvPlayback.js` (`triggerTVPlayback(ip, port, user, pass, timestamp)`,
      configurable endpoint/payload).
- [x] Add CCTV player screen/route with graceful Expo Go / network error UI.
- [x] Add per-transaction camera control on each `CustomerDetailScreen` transaction row
      (sibling touchable, `accessibilityLabel`/tooltip `پخش فیلم دوربین`); no general customer-level button.
- [x] Add cleartext HTTP config for local DVR CGI (`expo.android.usesCleartextTraffic`).
- [x] Extend `scripts/verify.js` with pure RTSP/TV helper checks + file assertions.
- [x] Run `npm run verify` (50/50 files ok, ALL CHECKS PASSED; rerun after installing `expo-clipboard`).
- [x] FIX Expo Go render error at `CctvPlayerScreen.js:137` (`undefined is not a function`): `useLang()` returns `{lang,setLang,isEn,ready}`, not `t`; `t` is imported from `../i18n`. Applied same fix to `src/components/UpdateNotice.js` (identical latent pattern).
- [x] Per-transaction CCTV entry point: `CustomerDetailScreen` has `openTransactionCctv(item)`, calls `transactionTimestamp(item)` and `navigation.navigate('CctvPlayer', { timestamp, customerName })`; invalid/missing time shows `زمان تراکنش نامعتبر` / `زمان این تراکنش نامعتبر است؛ پخش آرشیو ممکن نیست.`. General customer-level CCTV button removed; share/delete behaviour untouched.
- [x] `transactionTimestamp(value)` now returns a valid raw string unchanged (no `.000Z` rewrite), `null` for missing/invalid; non-string valid values use ISO. This preserves each old/new transaction's own exact timestamp.
- [x] Extended `scripts/verify.js` with per-transaction assertions and exact older-window case (`2026-11-18T08:00:00Z` → `20261118T075500Z`/`20261118T080500Z`).
- [x] Final `npm run verify`: `parse: 50/50 files ok`, `unbound identifiers: checked`, `unit checks: ok`, `ALL CHECKS PASSED`.
- [x] Metro restarted ONLY for ContactsApp on `http://127.0.0.1:8082/` with `CI=1` (file watching disabled due to inotify ENOSPC); active HayatAlSahabah process on port 8081 left untouched.
- [x] Final Android dev bundle on port 8082: `bundle_http=200 bundle_bytes=9128407`; tokens `transactionTimestamp=3`, `openTransactionCctv=2`, `transactionCctv=2`, `Invalid transaction time=1`, `CctvPlayerScreen=9`.
- [x] **RTSP port split fix (2026-11-19):** the app was sending RTSP to `dvrPort` (34567 = DVRIP
      control, closed on this box). `src/utils/rtsp.js` now has `DEFAULT_RTSP_PORT='554'` +
      `rtspPortOf()`/`dvripPortOf()`/`channelOf()`, `toDvrStamp()` defaults to the DVR LOCAL clock
      (UTC kept as `{utc:true}` + `toDahuaStamp()`), and `buildLiveUrl`/`buildPlaybackCandidates`
      (archive-local, archive-utc, `/cam/playback`, live-xm). `SettingsContext` stores `rtspPort` +
      `dvrChannel`; Settings shows a «پورت RTSP» field and a 1–4 channel selector; the player renders
      an ordered «گزینه‌های پخش» card (play + copy per candidate) so the firmware question is settled
      in one tap. `tvPlayback` keeps `port` for the CGI endpoint and takes `rtspPort` for video.
- [x] `scripts/verify.js`: CCTV block rewritten for the new API (local/UTC/Dahua stamps, port
      defaults, live URLs, candidate order, channel clamp, masking of both `user:pass@` and
      `password=` forms) + a translated-strings coverage assert for the three CCTV screens.
- [x] Final `npm run verify` after the fix: `parse: 53/53 files ok`, `unbound identifiers: checked`,
      `unit checks: ok`, `ALL CHECKS PASSED`; forbidden-hook scan (`ErrorUtils|setGlobalHandler|
      console.error|unhandledrejection|onerror`) = **0** in the CCTV files.
- [x] Metro 8082 restarted PID-targeted with `CI=1` (8081 untouched, both 200); warm Android dev
      bundle **10,085,987 B** containing `buildPlaybackCandidates`=3, `rtspPortOf`=3, `channelOf`=3,
      `toDahuaStamp`=4, `rtspPort`=30, `dvrChannel`=12 and all new Persian labels ×2.
- [ ] WAIT for explicit Expo Go confirmation that each transaction's camera icon opens `CctvPlayer` with that transaction's exact time; then commit-push + tag + CI build.
- [ ] After APK: test real RTSP/CGI on device and report exact APK filename + sha256.

## Decisions
- Persist settings in existing `SettingsContext`/AsyncStorage, not a new store.
- No automatic honorific/text rewriting; no SMS/ledger changes.
- No native RTSP/video dependency: the player only builds/masks/copies the link and triggers TV playback; Expo Go must still render safely.
- CCTV is per-transaction only; no general customer-level button. Camera control is a sibling touchable because nested touchables get swallowed on Android.
- `transactionTimestamp()` preserves raw valid strings verbatim; no `new Date()` fallback/invented current time.
- Start = transaction time − 5 min; end = start + configurable duration (default 10 min).
- No push, tag, or APK build until the owner explicitly confirms the Expo Go test.
- TV trigger stays a separate module with configurable endpoint/payload.
- Same-device Expo Go uses localhost port 8082, never `--tunnel`; use PID-targeted kill for ContactsApp 8082 processes only.

NOW: RTSP/port split fix implemented + verified (53/53, bundle 10,085,987 B on 8082). Owner said
2026-11-20 he has NOT run Expo Go yet; release gate CLOSED — no bump/push/tag/CI/APK until he reports
the result. `1` = candidate `archive-local` only, not a pass.
NEXT: on his explicit confirmation → bump version, commit, push, tag, CI build. Real DVRIP archive
playback (`OPFileQuery`/`OPPlayBack` on port 34286) still needs a native module and its own approval.
