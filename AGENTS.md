## CCTV-only diagnostics scope (owner, 2026-11-19 — supersedes broad diagnostics work)

- The requested diagnostics section is **CCTV/DVR only**: «گزارش و عیب‌یابی دوربین».
  Do NOT build application-wide diagnostics or instrument SMS/transactions/customers/reminders.
- Existing general diagnostics helpers are reusable ONLY for CCTV logging; narrow them to
  CCTV event categories and keep names/imports explicit. Do not delete unrelated work.
- Logs are local-only, sanitized (no passwords, RTSP credentials/URLs, customer names/phones,
  card/financial data), severity-filterable, capped, persistent, and copyable via the exact
  actions «کپی همه لاگ‌ها» / «کپی خطاها» / «پاک کردن لاگ‌ها» with a clear-confirm dialog.
- Phase order (TASK.md is the status source of truth): 1 review/re-scope helpers/context →
  2 RTL CCTV diagnostics screen → 3 provider + stack route only → 4 drawer entry + i18n →
  5 instrument CCTV/DVR events only → 6 focused tests/verify.js assertions →
  7 `npm run verify` + Metro 8082 bundle → 8 TASK.md/report + Expo Go gate.
- One phase at a time; inspect actual Git diff after each phase; no push/tag/CI/APK; never
  touch HayatAlSahabah Metro on 8081; Expo Go gate still applies.
- Phase 1 RE-SCOPED + VERIFIED 2026-11-19: `src/utils/diagnostics.js` now uses
  `@cctv_diagnostics_log_v1` + `CCTV_LOG_SECTIONS` (cctv/settings/playback), no broad
  `LOG_SECTIONS`; `src/store/DiagnosticsContext.js` exports CCTV-named hooks/provider;
  `App.js` imports `CctvDiagnosticsProvider`/`CctvDiagnosticsScreen` (no `LOG_SECTIONS`).
  `npm run verify` = 52/52 + ALL CHECKS PASSED; targeted hook harness = 11/11 pass.
  Actual diff inspected. Continued below; Phase 2 is now verified.
- Phase 2 VERIFIED 2026-11-19: `src/screens/CctvDiagnosticsScreen.js` created (new file,
  359 lines); actual diff inspected via `git diff --no-index -- /dev/null ...`. Persian RTL
  severity filter + empty/loading states + error styling + exact copy-all/copy-errors/
  clear-confirm actions; no malformed mixed-script strings; `npm run verify` = 53/53 +
  ALL CHECKS PASSED. STOP before Phase 3. Later-phase code already present in the tree is
  NOT checked off until its own phase is inspected/tested/reported.
- Phase 3 VERIFIED 2026-11-19: `App.js` mounts `CctvDiagnosticsProvider` inside `SmsInboxProvider`
  (wrapping StatusBar/RootNavigator/UpdateNotice) and registers `CctvPlayer` + `CctvDiagnostics`
  stack screens; grep for `ErrorUtils|setGlobalHandler|global.Error|unhandledrejection|onerror|
  console.error` over the four diagnostics files = 0 matches; `npm run verify` = 53/53.
- Phase 4 VERIFIED 2026-11-19 (drawer + i18n): ONE new `MenuItem` in `src/components/AppDrawer.js`
  (`bug-outline`, label «گزارش و عیب‌یابی دوربین», `go('CctvDiagnostics')`), reusing the existing
  `go()` → `navigation.navigate('MainStack', { screen })` pattern; grep count for `CctvDiagnostics`
  in the drawer = 1 (no duplicate). `src/i18n/dict.js` gained 27 English mappings in a
  `// ── CCTV diagnostics ──` block inside the existing `Object.assign(en, { … })` (additions only,
  single-quote style); coverage = 29 screen `t()` literals → 0 missing. `npm run verify` 53/53
  ALL CHECKS PASSED. No Metro bundle yet (Phase 7), no APK/push/tag/CI.
  NOTE: `dict.js` already carries 25 PRE-EXISTING duplicate keys (all older entries, none of them
  the new CCTV ones) — left untouched; do not "fix" them in a diagnostics phase.
- If `scripts/verify.js` still says port 8081, ignore it: ContactsApp Metro must stay on 8082.
- **METRO 8082 — correct start (2026-11-19).** `~/restart-metro-contacts.sh` is STALE and
  DANGEROUS for this task: it runs `pkill -f "[e]xpo"` (would kill HayatAlSahabah on 8081) and
  starts on port 8081. Do NOT use it while 8081 must survive. Correct, PID-targeted start:
  stop only `pgrep -af "[e]xpo start.*8082"`, then
  `EXPO_NO_TELEMETRY=1 setsid bash -c "cd ~/ContactsApp && EXPO_NO_TELEMETRY=1 CI=1 npx expo start --host localhost --port 8082 --clear </dev/null >~/contacts-metro-8082.log 2>&1" </dev/null >/dev/null 2>&1 &`
  → `exp://127.0.0.1:8082`. CI=1 disables reloads, so restart after every code edit. Cold Android
  dev bundle ≈ 100 s / ~10.06 MB (warm it first). QR helper: python `qrcode` (installed) →
  `qrcode.make('exp://127.0.0.1:8082')`; PNG saved to
  `/storage/emulated/0/Download/contacts-expo-8082-qr.png`.
  Benign Termux warning at startup: "An unknown error occurred while installing React Native
  DevTools … reading 'arm64'" — devtools only, Metro still serves 200.

## Native CCTV archive playback module (2026-11-20, code complete, Kotlin compile still unverified)
- `modules/cctv-playback/` is a LOCAL Expo module (`expo.modules.cctvplayback.CctvPlaybackModule`);
  autolinking is proven: `npx expo-modules-autolinking search --platform android` lists
  `cctv-playback` → `expo.modules.cctvplayback.CctvPlaybackModule`. It is required for archive
  playback (Expo Go cannot open a TCP socket).
- `DvripClient.kt`: DVRIP over TCP — 20-byte header (`BB2xII2xHI`), `sofia_hash` login (msgid 1000),
  `OPFileQuery` (1440, 64-row pages), `OPPlayBack` claim (1424) + `DownloadStart` (1420) chunks until a
  zero-length header, then `DownloadStop`. Guards: 32 MB packet cap in `readExact`, JSON-refusal
  detection (`first[0] == '{'` → `describeRet`), `cancelled` flag, `stamp(Date)` emits the DEVICE-LOCAL
  `YYYY-MM-DD HH:MM:SS` (never UTC `Z`). `ArchiveFile(fileName, begin, end, size)`.
- `CctvPlaybackModule.kt`: `playArchive({ip, port, user, password, channel, startMs, endMs})` runs on a
  worker thread → widened ±30 min query window → `pickFile` → download to
  `cacheDir/cctv/clip-<ts>.h264` → starts `CctvPlayerActivity`. Emits `onCctvEvent`
  (`stage` / `progress` / `error`). `pruneClips()` keeps only the 2 newest clips (cache bounded).
  `stop()` sets `cancelRequested` AND closes the socket — a blocked DVRIP read only unblocks when the
  socket dies — and the cancelled run deletes its partial clip.
- `CctvPlayerActivity.kt`: memory-mapped player, no external app, no player prompt. `ClipView`
  (`FileChannel.map` READ_ONLY; unwraps into memory only when the clip is frame-container shaped and
  ≤48 MB), `ElementaryStream` (Annex-B 3/4-byte start-code split, `video/avc` / `video/hevc` sniff,
  SPS/PPS-first `firstPlayableIndex`, pacing from frame count at 25 fps, CODEC_CONFIG + END_OF_STREAM
  flags). Persian status lines (missing/empty/unplayable/failed), tap to close.
- `CctvPlayerScreen.js` calls the module; in Expo Go it receives `{ok:false, reason:'unavailable'}` and
  shows the copy-only diagnostics + an honest message. There is NO RTSP handoff and NO external player
  anywhere — that was what produced VLC's password prompt.
- Kotlin gotchas that cost a review pass (remember them):
  `Byte` does NOT widen to `Int` — use `unit[0].toInt() and 0xFF`; and `continue` inside a `when` used as
  an EXPRESSION is unsafe — write a `when` STATEMENT with `var payloadSize: Long`.
- `scripts/verify.js` now walks the whole `modules/` tree (54/54 files) instead of only
  `modules/sms-reader/index.js`, so the new native JS wrapper is parsed like app code.
- Release gate still CLOSED: no version bump, push, tag, CI run or APK until the owner reports the
  Expo Go result. Kotlin is only compiled by a real build, so the first CI run IS the compiler.

## RELEASE RULE (owner, 2026-11-11 — applies to EVERY change)

**Expo Go test gate comes BEFORE any push or APK build.** The order is fixed:

1. code change → `npm run verify` → start Metro (`npx expo start --tunnel`) →
   give the owner the `exp://` URL/QR;
2. **WAIT** for the owner's explicit confirmation that it works in Expo Go;
3. only THEN commit-push to `origin/main` and let the CI "Build APK" run.

Local commits are fine at any time; `git push` and CI builds are the gated step.
Native-only features (SMS inbox, silent SMS send) cannot be tested in Expo Go —
say so and test those on the APK after the JS parts are confirmed.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Current app (2026-11-10 — Persian UI, Toman, auto-SMS, Premium, drawer + backup)

Persian (RTL) customer-ledger app. Balance = credits − payments (positive = the
customer owes the shop). UI is a hand-built "eKhata" look: purple gradient header,
white cards, green = receive payment, red = give credit, floating + bottom-left.
**The whole UI is Persian and all money is Toman (تومان)** — no English labels, no Rial.

```
App.js                      GestureHandlerRootView > SafeArea > SettingsProvider >
                            PremiumProvider > ProfilesProvider > ContactsProvider >
                            SmsInboxProvider > NavigationContainer > LockGate >
                            DrawerShell (drawer on the RIGHT, type front, swipeEnabled
                            false — hamburger only) wrapping nested MainStack.
                            Trial gate: `locked` swaps the whole stack for Premium.
src/theme.js                colors/radius/shadows, faText/rtl/rtlCenter, REMINDER_THRESHOLD,
                            TOMAN_PER_UNIT
src/utils/format.js         toFa/toEn, group (Latin), money (Persian + ٬), parseAmount,
                            groupCard, Jalali date, faLetterIndex
src/utils/calc.js           calculator engine: tokenize + recursive descent, phone-%
                            (200+10%→220, 200×10%→20, bare % = fraction),
                            formatCalcResult (Persian digits ٬ ٫), formatExpression
src/utils/backup.js         buildBackup/parseBackup/toCsv/backupFileName
src/utils/exports.js        exportBackup/exportCsv/pickBackupFile (cache file → share
                            sheet → delete; no direct Download write — scoped storage)
src/utils/smsParser.js      bank-SMS → {amount, tomanAmount, rawAmount, direction, card, bank};
                            buildReminder() = the exact Persian reminder template
src/utils/smsSend.js       silent SMS transport ladder (native SmsManager →
                            composer fallback), sendSilently/silentSmsAvailable
src/utils/reminderAuto.js  AUTOMATIC reminder: fired by the transaction save
                            (silent only, latch on success, inFlight guard)
src/utils/trial.js          7-day trial math (pure): TRIAL_DAYS = 7, trialInfo(start, now)
src/utils/billing.js        Myket/Cafe-Bazaar IAP placeholder (BILLING_READY=false)
src/store/ContactsContext.js single source of truth (AsyncStorage @contacts_data) +
                            importContacts(list) bulk replace (restore + clear-all)
src/store/SettingsContext.js myName / cardNumber / shopName / appLock (@settings_data)
src/store/ProfilesContext.js customer categories (@customer_profiles, seeds فروشگاه/شخصی)
                            + importProfiles(list)
src/utils/profiles.js      cleanProfileName / isDuplicateProfile / profileCounts / contactsOfProfile
src/utils/grouping.js      lettersOf + letterBuckets (dynamic chips + Persian sections)
src/store/PremiumContext.js premium + trial (AsyncStorage @premium_state / @premium_trial),
                            trialActive/trialDaysLeft/locked/hasAccess, 60s tick + AppState,
                            buy/restore/unlock, debugShiftTrial (__DEV__ only)
src/components/ui.js        ScreenHeader, Avatar, Chip, EmptyState, ActionButton
src/components/AmountSheet.js amount bottom sheet (+ quick chips, settle-all)
src/components/AppDrawer.js right drawer: gradient header, debtors card (live count +
                            receivable), trial row, menu → home/settings/categories/
                            report/calculator/SMS imports (navigate('MainStack',{screen}))
src/screens/HomeScreen.js   minimal header (hamburger + shop name + search icon),
                            letter chips + list + FAB; search = name/phone/cardNumber;
                            (no reminder logic — the trigger lives in ContactsContext)
src/screens/DebtorsScreen.js all debtors, letter chips + alphabetical sections, totals
src/screens/ReportScreen.js all-customers report (credit/payment/net) + CSV share button
src/screens/CalculatorScreen.js button-grid calculator, Persian display, ASCII expr inside
src/screens/LockScreen.js   biometric unlock (expo-local-authentication, auto-attempt)
src/screens/CustomerDetailScreen.js balance card, call/SMS quick actions
                            (Linking.openURL tel:/sms:), actions, auto-SMS reminder,
                            transactions (tap = edit sheet; long-press = delete confirm)
src/screens/CustomerFormScreen.js  add/edit customer (+ trial-lock guard)
src/utils/smsMatch.js              SMS → customer matcher (card last-4 / full name / partial)
src/utils/reminderGate.js          REMINDER_THRESHOLD + reminderAction() (send/reset/none latch)
src/utils/reminderAuto.js          autoSendReminder() — the automatic trigger path
src/utils/reminderSend.js          sendManualReminder() — fallback button flow
src/store/SmsInboxContext.js       auto-import pipeline (native queue → parse → record)
src/screens/SmsImportScreen.js     pending auto-imports + paste SMS → parse → pick customer
modules/sms-reader/                LOCAL native module (Kotlin receiver + JS bridge)
src/screens/ProfilesScreen.js      category list + counts (+ «بدون دسته» row)
src/screens/ProfileDetailScreen.js one category: dynamic letter chips + alphabetical sections
src/screens/ProfileFormScreen.js   add / rename / delete a category (delete cascades)
src/screens/SettingsScreen.js      my name / card number / shop name + reminder preview +
                            پشتیبان‌گیری و داده‌ها (backup/restore/CSV/clear-all) + app-lock switch
src/screens/PremiumScreen.js       trial paywall (days left / trial ended), buy, restore
```

### Rules added 2026-11-09
- **Amounts are literal + one ledger unit = 1,000 Toman (load-bearing, v5 2026-11-09)**: the
  stored number is exactly what is typed/displayed — `190` stays `190`. There is deliberately NO
  `applyAmountRule` helper (a "small amount means thousands" shortcut was added and removed on
  the owner's request), so never reintroduce it. The ONLY amount transformation is the SMS
  conversion in `parseBankSms`: Rial ÷ 10 = Toman, then ÷ `TOMAN_PER_UNIT` (1,000) = ledger units
  → `۱٬۹۰۰٬۰۰۰ ریال` becomes `190,000` Toman and is stored as `190`, exactly like typing `190`.
  `parseBankSms` returns `amount` (ledger units), `tomanAmount` (plain Toman) and `rawAmount`.
  `money()` only formats (Persian digits + `٬`); it never divides or shortens. Manual entry
  (`parseAmount`), pending auto-imports (`item.amount`, with `item.amountToman` read as a legacy
  fallback) and `normalizeTransaction` all store the plain number. Customer-facing texts
  (`buildReminder`) multiply by `TOMAN_PER_UNIT` so the customer reads real Tomans.
- `AmountSheet` keyboard: `KeyboardAvoidingView` uses `behavior="height"` on Android and
  `"padding"` on iOS; quick-amount chips were removed (only «تسویه کامل» remains).
- **Provider order is load-bearing**: `SettingsProvider` and `PremiumProvider` must wrap
  `NavigationContainer`. Every screen calls `useSettings()`/`usePremium()`; moving them
  inside the navigator reproduces the "useSettings must be used inside SettingsProvider"
  crash.
- **Business model = 7-day free trial, then one-time Myket purchase (v6 2026-11-09)**. No
  customer cap anymore (`FREE_CUSTOMER_LIMIT` is gone). On the first launch `PremiumContext`
  writes `{ startedAt, lastSeenAt }` to `@premium_trial`; the trial ends at
  `startedAt + 7 days` (`src/utils/trial.js`). During the trial everything is unlimited.
  After it ends, `locked` becomes true and `RootNavigator` renders **only** the Premium screen
  (no back button), so the whole app is gated. Purchase/unlock sets `premium` and unlocks
  instantly. `lastSeenAt` is bumped at most every 5 min and the comparison uses
  `Math.max(now, lastSeenAt)`, so rolling the phone clock back cannot reopen an expired trial.
  `debugShiftTrial(8)` (button only under `__DEV__`) fast-forwards for testing.
- Reinstall: AsyncStorage is app-private and Android deletes it on uninstall — survival relies
  on Android Auto Backup (`android.allowBackup: true` in `app.json`) restoring the data.
  There is no server in this app, so nothing stronger is possible client-side; Myket's own
  account-bound purchase/restore is the real permanent authorization.
- `react-native-iap` / Poolakey are native modules → they break Expo Go, so billing is a
  documented stub in `src/utils/billing.js` (same `{ok, reason}` shape as the real SDK).
  The "فعال‌سازی آزمایشی" button unlocks locally for testing.
- Automatic reminder (anti-spam latch): the customer carries `smsSentForCurrentDebt`.
  `reminderAction()` in `src/utils/reminderGate.js` decides `send` / `reset` / `none`:
  debt above `REMINDER_THRESHOLD` (now **1,000 ledger units = 1,000,000 Toman**, v5) with the
  latch off → send the SMS once, silently (exact template from `buildReminder()`, including the
  «لطفاً پس از واریز، تصویر رسید تراکنش را برای این شماره ارسال نمایید.» line before the final
  thanks and «به نام: {myName}») and set the latch; debt back to/≤ threshold → the
  latch is cleared, so the next crossing sends exactly one more; while the debt stays above,
  nothing is ever re-sent. `ContactsContext` clears the latch inside every transaction mutation
  (`settleReminderLatch`), so a payment recorded from a bank SMS resets it even when the detail
  screen was never opened. Missing `settings.myName`/`cardNumber` or a customer phone → no send
  AND no latch. The in-memory `firedRef` scheme is gone; never reintroduce a per-balance-key
  trigger. Unit-tested in `scripts/verify.js` (send → silent → reset → send again).

### Drawer, backup & app lock — v8 2026-11-10
- **Drawer is right-positioned, `type 'front'`, `swipeEnabled: false`** — it opens only
  via the hamburger so it never fights the Android back gesture. Home header is
  minimal: hamburger + shop name + search. Settings gear, categories row and the
  summary cards live in the drawer now. Drawer targets nested routes with
  `navigation.navigate('MainStack', { screen })` (stack name is load-bearing).
- **Backup = share sheet, never direct Download writes**: scoped storage exposes only
  cache/document/bundle paths, so exports write to `Paths.cache`, `Sharing.shareAsync`,
  then delete the temp file. Restore uses DocumentPicker + `File.text()`.
- **Backup JSON shape**: `{ app:'ekhata-backup', version:1, exportedAt, counts, contacts,
  profiles, settings }`. `parseBackup` also accepts a legacy bare contacts array.
  Restore restores contacts/profiles/myName/cardNumber/shopName but **NEVER `appLock`**
  (a lock belongs to the phone's owner, not the backup). `importContacts` bulk-replaces
  (normalizeContact runs per row), `importProfiles` only when the file carries profiles.
- **CSV** carries a UTF-8 BOM (`\uFEFF`) so Excel renders Persian; columns
  نام/شماره تماس/دسته/کل بدهی/کل دریافت/مانده + a جمع کل totals row.
- **Calculator**: input comes ONLY from the button grid; the expression stays ASCII
  internally, rendering goes through `formatExpression` (×÷, Persian digits). Percent
  follows phone semantics: `200+10%`=220, `200×10%`=20, bare `50%`=0.5.
- **App lock** (LockScreen + LockGate) sits INSIDE the unlocked path: LockGate wraps
  DrawerShell but only when `settings.appLock` is on; re-locks on AppState
  `background` via an in-memory unlock ref. Toggle guards with
  `LocalAuthentication.hasHardwareAsync` + `isEnrolledAsync`.
- Call/SMS quick actions use `Linking.openURL('tel:'/'sms:')` with try/catch only —
  no `canOpenURL` (Android 11 package visibility would need extra manifest queries).

### Silent SMS sending — v9 2026-11-10
- **The reminder is AUTOMATIC and fires from the transaction save path.** The trigger
  lives in `ContactsContext` (`fireAutoReminder`) and is called by
  `addTransaction` / `updateTransaction` / `deleteTransaction` right after the new
  contact is committed — so the moment a credit pushes the debt above
  `REMINDER_THRESHOLD` the silent SMS goes out with no button press. There is NO
  screen sweep and NO AppState effect. v11 added exactly ONE recovery entry point
  (`attemptAutoReminder`, called when a customer screen shows a debt that crossed
  while sending was impossible) — it is idempotent via the latch + inFlight Set;
  never add another. `scripts/verify.js` statically asserts all three call sites.
- The store keeps the list in `contactsRef` (synchronous) alongside state, so a
  mutation knows the NEW balance in the same tick — that is what makes the instant
  trigger possible. Any new mutation must go through `commit(next)`.
- `src/utils/reminderAuto.js` → `autoSendReminder({ contact, balance, settings,
  setSmsSentForCurrentDebt })`: **silent only** (no Alert, no composer — a popup in
  the middle of a save would be a surprise), latches ONLY on a successful send, and
  keeps an `inFlight` Set so two quick saves cannot double-send. Unavailable native
  module / denied permission → no send AND no latch (next save retries).
- Rules: (1) debt above 1,000 units (1,000,000 Toman) → exactly one SMS;
  (2) payment brings it to/≤ 1,000 → `settleReminderLatch` clears the latch;
  (3) new credit above again → exactly one more SMS.
- The manual buttons (CustomerDetail + Debtors, `src/utils/reminderSend.js`) are now
  only a FALLBACK: Expo Go (no native module), denied SEND_SMS, or a customer whose
  switch was turned on after the debt already crossed. They keep the composer
  fallback; the automatic path never uses it.
- Transport ladder (`src/utils/smsSend.js`): native `sendSms` (SmsManager,
  multipart — Persian is UCS-2) → composer (`sms:` URL) fallback.

### Reminder UI + build identity — v11 2026-11-10 (owner bug report)
- **Owner complaint:** the «ارسال یادآوری» button stayed visible and nothing was
  sent. Root cause was two-fold: (a) the installed APK was the **v9** build — the
  automatic trigger only exists from v10; (b) both builds shipped as version
  `1.2.0` with the same APK/artifact name, so v9 and v10 were indistinguishable.
- **Auto trigger is now crossing-only:** `fireAutoReminder(contact, raised)` skips
  the send when the mutation lowered the debt (a payment must never send a
  reminder). `raised = balanceOf(updated) > balanceOf(target)` at all 3 call sites.
- `src/utils/reminderUi.js` (pure, Node-testable) decides which control the screen
  may show: `BELOW / OFF / SENT / ARMED / PERMISSION / SETTINGS / PHONE /
  UNAVAILABLE`. **ARMED and SENT mean the automatic sender owns the job → NO
  manual button** (that was the bug). Other modes show ONE labelled fallback
  button tied to the actual blocker (`اجازه ارسال` / `تنظیمات` / `شماره` /
  `ارسال دستی` for Expo Go). «پیامک تسویه» below the threshold stays manual.
- The automatic path never opens the Android permission dialog (`hasSendPermission`
  → no-prompt check); the fallback «اجازه ارسال» button requests it and then calls
  `attemptAutoReminder` so the pending debt is sent immediately.
- A customer screen re-checks SEND_SMS on mount (`hasSendPermission`).
- **Version identity:** `app.json` = `1.3.0` / `android.versionCode: 10`; Settings'
  footer shows `eKhata — نسخه {BUILD_STAMP}` from `src/buildInfo.js` (imports
  app.json, verify.js asserts no drift). The CI APK is copied to
  `eKhata-v<version>-<versionCode>.apk` and the artifact is named
  `eKhata-v<version>-<versionCode>` (workflow step `Read app version`).
- `reminderAction()` in `src/utils/reminderGate.js` is pure (`send`/`reset`/`none`) —
  never import React-land into reminderGate; verify.js requires it in Node.
- Persian-digit-only phone numbers cannot be dialed silently (everything is
  stripped to `[0-9+]`), so `cleanSmsPhone()` empties them and no SMS is attempted.
  The customer form asks for English digits.
- Kotlin side lives in `SmsReaderModule.sendSms` with its own
  `checkSelfPermission(SEND_SMS)` guard and returns `{ok, reason}` maps; the
  manifest and app.json both list SEND_SMS.
- Metro pitfall (Termux): a stale per-file transform can serve an OLD module
  while other files are fresh — `rm -rf node_modules/.cache` + restart Metro
  when bundle contents look behind the source. Also: Persian strings may
  appear as `\uXXXX` escapes in the bundle (grep for the ASCII identifiers
  instead).

### Customer categories (profiles) — v7 2026-11-09
- The ONLY link is `contact.profileId` (`''` = بدون دسته); never nest a profile object in
  a customer. Names are unique (`isDuplicateProfile`), trimmed and capped at
  `PROFILE_NAME_MAX = 24`.
- Deleting a category must never delete customers: `ProfileFormScreen` calls
  `clearProfileFromContacts(id)` BEFORE `deleteProfile(id)`.
- Letter chips/sections come from `src/utils/grouping.js` (`lettersOf`, `letterBuckets`) so
  Home and `ProfileDetailScreen` can never drift; only letters with customers appear.
- `ProfilesProvider` sits ABOVE `ContactsProvider` in `App.js`; screens `Profiles`,
  `ProfileDetail`, `ProfileForm` are registered in the unlocked stack only (trial lock).

Rules that keep it working:
- **RTL is manual** (`flexDirection:'row-reverse'` + `writingDirection:'rtl'`).
  Never rely on `I18nManager.forceRTL` — it needs a native reload and Expo Go
  will not apply it mid-session.
- Screens receive only `contactId` in params and read the contact from context;
  never pass whole contact objects (that was the old stale-balance bug).
- Balances must be recomputed via `balanceOf()` on every render — no cached copies.
- Persian digits for display only (`money`/`toFa`); `TextInput` and stored values keep
  Latin digits, and `parseAmount` accepts both.
- Native SMS auto-import (2026-11-09): `modules/sms-reader` is a LOCAL Expo module
  (autolinked, no package in node_modules). It adds RECEIVE_SMS/READ_SMS, an
  SMS_RECEIVED BroadcastReceiver that queues messages in SharedPreferences, and
  `getPending/clearPending/readInbox` for JS. Expo Go has no such module → every
  call no-ops and Settings shows "نیازمند نسخه APK"; the paste screen still works.
  A real APK/dev build is required to test it (`npx expo run:android` or
  `eas build -p android`); `android/` is generated by prebuild and gitignored.
- SMS pipeline: `src/store/SmsInboxContext.js` drains the native queue, parses with
  `parseBankSms`, matches with `src/utils/smsMatch.js`, records high-confidence
  deposits automatically and keeps the rest in a persisted pending list. Dedupe key
  = address|timestamp|normalized body (`@sms_seen_keys`). The shop's own card last-4
  is always ignored, and personal SMS are filtered out (needs bank name or card).
- SMS semantics as SHIPPED in **1.4.0 (code 11, HEAD `3581d29`)** — the exact decision
  chain, so nobody has to re-read it:
  1. Kotlin `SmsReceiver` (priority 999) catches SMS_RECEIVED, merges multipart by sender,
     dedupes by `live-<address>-<ts>-<bodyHash>`, stores newest-first in SharedPreferences.
  2. JS drains on launch (after contacts hydrate), on live `onSmsReceived`, and on AppState
     → active. Pulls the live queue + `readInbox(lastScan,100)`; first scan window = last 6h.
  3. `isBankDeposit(parsed)` gate = `parsed.ok` (an amount was found) AND direction !== 'out'
     AND (`bank` OR `card` present). No amount / withdrawal / no bank name / no masked card →
     silently ignored. **In 1.4.0 there is NO sender check at all.**
  4. `confidence === 'high' && match` → auto-recorded + `recentAuto` banner (max 10).
     high = exactly ONE customer matched by card last-4 (shop's own card excluded) OR by
     full `nameKey` (≥5 chars) found in the body. Everything else that passed the gate →
     `pending` (max 50) for one-tap confirm via `recordPending`.
  5. Amount: Rial ÷10 → Toman, ÷1000 → ledger units (1,900,000 ریال → 190,000 تومان → 190).
  ⇒ Consequence: a bank SMS FORWARDED from a mobile number (or any personal text that
  contains "واریز … ریال" + a bank name) IS treated as a deposit in 1.4.0 and auto-imports
  on a high-confidence match. The app never forwards SMS anywhere; the only outgoing SMS is
  the debt reminder (`buildReminder` → `sendSmsNative`, once per debt, threshold 1,000 units).
- **Manual sender exclusion (2026-11-18, replaces the v13 official-sender gate).** The
  v13 `isOfficialBankSender(address)` helper + the `officialSender && confidence==='high'
  && match` gate were REVERSED by the owner (a customer may forward a bank receipt from a
  personal mobile, and it must still auto-import). Instead: `settings.excludedSmsSenders`
  (persisted in `@settings_data`, **empty by default**) is a manually-managed ignore list.
  `src/utils/smsParser.js` exports `normalizeSender(address)` (digits only) and
  `isExcludedSender(address, list)` (exact match, plus a last-10-digit match to tolerate a
  country-code/leading-zero difference; a short bank code like `2000` matches exactly, never
  as a prefix). `SmsInboxContext.scanNow` skips an excluded sender entirely — no parse, no
  import, no pending — but the message is still marked seen (and the native queue cleared),
  so it never resurfaces. Every other sender is processed exactly as in 1.4.0. Settings
  gained a «نادیده‌گرفتن شماره‌ها» block (add via phone-pad input, remove via chip ✕).
  `scripts/verify.js` asserts `isExcludedSender` behaviour and statically guards that
  `isOfficialBankSender` no longer appears in `smsParser.js`/`SmsInboxContext.js`.
- **In-app update checker (2026-11-18, v1.5.0 WIP).** `src/utils/updateCheck.js` holds the
  pure helpers (`parseVersion`, `isNewer`, `fetchUpdateManifest`) + `UPDATE_MANIFEST_URL =
  https://elyasyy23-lgtm.github.io/elyasyy-apps/ContactsApp/version.json`. `isNewer` is a
  numeric dotted compare (1.10.0 > 1.9.0); `fetchUpdateManifest` is 8 s AbortController,
  `?t=` cache-buster, and NEVER throws (any failure → `null`). `src/components/UpdateNotice.js`
  runs the check ONCE per launch and shows a Persian modal when the website advertises a newer
  `latestVersion` than `APP_VERSION` (from `buildInfo.js`, i.e. `app.json`): the owner's exact
  text «نسخه جدید برنامه منتشر شده است. لطفاً برای دریافت آخرین امکانات، برنامه را بروزرسانی کنید.»
  + «بروزرسانی» (opens the download page) / «بعداً». It is mounted in `App.js` as a sibling of
  `RootNavigator` so it paints above every screen. `scripts/verify.js` unit-tests `parseVersion`
  / `isNewer` and asserts the mount. The website side (a `version.json` + download page in the
  elyasyy-apps Pages repo) is published together with the release; old FocusBlocker URLs redirect.
- **CI release surface (2026-11-18).** `.github/workflows/build.yml` now has
  `permissions: contents: write`, names the artifact `HesabYar-v<ver>-<code>.apk`, ALSO writes a
  STABLE copy `HesabYar-release.apk`, and on a `v*` tag publishes a GitHub Release via
  `softprops/action-gh-release@v2` with that stable asset. The website + the in-app update
  checker both point at `.../releases/latest/download/HesabYar-release.apk` (stable filename →
  no Chrome "Download file again?" warning).
- Run `npx expo start --tunnel` (NOT plain `expo start`): the user's phone has
  mobile data only, so LAN/QR over WiFi never resolves. Same-phone alternative that
  needs no tunnel: Expo Go → "Enter URL manually" → `exp://127.0.0.1:8081`. Pre-install
  `@expo/ngrok` first (`npm i --no-save @expo/ngrok@^4.1.3`) or the CLI hangs on
  an install prompt. The Expo Go URL is `exp://<hostUri>` where hostUri comes
  from the manifest (`extra.expoGo.debuggerHost`); it changes on every restart.


## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
node scripts/verify.js      # offline gate: babel parse + unbound imports + format/SMS unit checks
npm run verify              # same thing via package.json
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- This project uses **React Navigation** (`@react-navigation/native` +
  `native-stack` + `react-native-drawer-layout`) wired in `App.js`. It does NOT use
  Expo Router — ignore the generic Expo Router advice below for this repo.
- Routes (nested `MainStack` inside the drawer): `Home`, `CustomerDetail`
  ({ contactId }), `CustomerForm` ({ contactId? }), `SmsImport`, `Profiles`,
  `ProfileDetail`, `ProfileForm`, `Settings`, `Premium`, `Debtors`, `Report`,
  `Calculator`. Stack animation is `slide_from_left` (RTL feel), headers are hidden
  and each screen renders `ScreenHeader` from `src/components/ui.js`.
- Screens get only ids; data comes from `ContactsContext`.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Source file inventory (absolute paths, Termux)

All app source lives under `/data/data/com.termux/files/home/ContactsApp/`:
`App.js` (25 KB), `index.js` (307 B), `app.json` (750 B), `package.json` (760 B),
`package-lock.json` (258 KB, optional), `assets/` (6 PNGs: icon, splash-icon,
favicon, android-icon-{background,foreground,monochrome}).

- Termux home is app-private: Chrome's file picker cannot see it, so browser-based
  GitHub uploads are impossible from here without copying files out first.
- `/storage/emulated/0` is **not writable** on this device (no `termux-setup-storage`
  grant yet) — `mkdir` there fails with "Permission denied". Grant it with
  `termux-setup-storage` if a shared-storage copy is ever needed.
- **FINAL VERDICT (2026-11-08): git push is impossible from this account.** The GitHub email is
  locked, so GitHub demands *sudo mode* (email verification) for every settings action: PAT
  creation, SSH key add, **adding a new email address**. SSH key was added but rejected
  (`Permission denied (publickey)`), and the OAuth device flow dead-ends at the authorize page.
  No token, no key, no collaborator invite, no deploy key. Only **web-UI commits** work.
- **Working delivery path: GitHub web UI uploads.** A local server
  (`/data/data/com.termux/files/usr/tmp/zyvo/srv.js`, start with `start.sh`) serves the 8 missing
  files at http://127.0.0.1:8484 with `Content-Disposition: attachment` so Chrome saves them to
  Downloads; the user then uses *Add file → Upload files*. Create `assets/` first via
  `assets/.gitkeep` (the uploader cannot target a non-existent folder).
- **Web upload is ALSO disabled** on this account (2026-11-08) — so no delivery path through the
  browser at all. Deliverable handed to the user instead: `~/storage/shared/Download/ContactsApp-source.zip`
  (574 KB, `git archive` of HEAD `878c15d`, 24 files, prefix `ContactsApp/`). Termux storage
  permission was finally granted, so `~/storage/shared` = `/storage/emulated/0` is writable now;
  `/storage/shared` itself does not exist as a symlink on this device — use `~/storage/shared`.
- **Remote already correct** (repo is public, verified via raw.githubusercontent.com):
  `.github/workflows/build.yml` = 81 lines with the npm-install fallback + `assembleRelease`,
  `package.json` = identical to local. Only missing: `App.js`, `index.js`, `app.json`,
  and the 5 referenced PNGs in `assets/`.
- CI run 2026-11-08 13:29 UTC failed exactly as expected (checked out `5522bde`, hit
  `com.anonymous.contactsapp` + `ENTRY_NOT_FOUND`). Do NOT re-run it; it rebuilds the same
  broken commit. A fresh push/upload of the source is what triggers a real build.

## Local APK build on Termux (no GitHub, no EAS) — 2026-11-08
`eas build` is dead for this account: upload returns **403 Forbidden** on the project tarball and
no build is ever created (`eas build:list` empty), even though `eas whoami` = `elyasyass` and
`eas project:info` resolves `@elyasyass/ContactsApp`. Do not retry it.

Local build is wired up instead (full recipe in skill `termux-android-apk-build`):
- SDK: `$PREFIX/opt/android-sdk` (Termux `android-sdk` 37.0.0) + `platforms/android-36` copied
  from `https://mirrors.cloud.tencent.com/AndroidSDK/platform-36_r01.zip` — `sdkmanager` and
  `dl.google.com` are both unusable on this network.
- `android/gradle.properties`: `android.aapt2FromMavenOverride=$PREFIX/bin/aapt2` (Termux aapt2
  is aarch64; the Maven one is x86_64).
- `~/.gradle/gradle.properties`: `org.gradle.java.installations.paths` must list JDK 17 —
  the failing `:gradle-plugin:settings-plugin` is an *included* build and ignores the project's
  gradle.properties. Also export `JAVA_HOME=$PREFIX/lib/jvm/java-17-openjdk`.
- **HARD BLOCKER on the phone: NDK.** `assembleRelease` reaches configuration and dies with
  `NDK not configured. Preferred NDK version is '28.2.13676358'`. RN 0.88 / expo-modules-core
  compile native code (codegen + core C++), so an NDK is mandatory — and Google ships NDK host
  toolchains for **linux-x86_64 / darwin only**, there is no aarch64 host build. `newArchEnabled=false`
  does NOT remove the requirement (tested). Termux has `ndk-sysroot`, `ndk-multilib`,
  `android-cmake` but no NDK-compatible layout — a shim is experimental, hours of work.
  ⇒ A phone-only APK build is NOT possible for this stack; use a PC or a cloud builder.
- Build: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a -Pandroid.enableMinifyInReleaseBuilds=false --no-daemon`
  → `android/app/build/outputs/apk/release/app-release.apk`.
- Maven traffic is rewritten to `https://maven.myket.ir` by an init script; it works.

## CI — APK build (GitHub Actions)

- Workflow: `.github/workflows/build.yml` → builds a signed release APK on every push,
  artifact `contactsapp-release-apk` (`app-release.apk`).
- **Repo state (2026-11-08):** `origin/main` contained ONLY `package.json` +
  `.github/workflows/build.yml`. The app source (`index.js`, `App.js`, `app.json`,
  `assets/`) was never pushed, which is why prebuild reported the default package
  `com.anonymous.contactsapp` and the entry check threw `ENTRY_NOT_FOUND`.
  Fix = push the source; the workflow now fails fast with "Missing 'index.js'".
- Local history diverged from `origin/main` (unrelated histories: 2 local commits vs
  27 remote web-editor commits). A merge with
  `git merge origin/main --allow-unrelated-histories -X ours` applies cleanly and
  keeps the local (full) tree.
- Toolchain (must stay aligned with Expo SDK 58): Node 22 (`expo`/`react-native`
  engines require `^22.13.0`), JDK 21, Gradle **9.4.1** — the version the Expo
  SDK 58 prebuild template generates. Never override the wrapper version.
- `android/` is gitignored → CI always runs `npx expo prebuild --platform android --clean`.
  Never commit or hand-edit `android/`; the local copy is disposable.
- Install with plain `npm install --no-audit --no-fund` (with a `--legacy-peer-deps`
  fallback). `package-lock.json` exists locally but was **not committed**, so `npm ci`
  and `actions/setup-node`'s `cache: npm` both fail with
  "Dependencies lock file is not found". Committing it (only ~258 KB, push via git)
  restores reproducible installs and allows `npm ci` + `cache: npm` again.
- Release build runs with `-Pandroid.enableMinifyInReleaseBuilds=false` for the first
  green builds (R8/shrinking off); re-enable once the APK is confirmed working.
- The template's `release` buildType already signs with the debug keystore, so
  `assembleRelease` yields an installable APK. A real keystore is only needed for
  Play Store uploads.
- Gradle error `Cannot convert '' to File` at `android/app/build.gradle` line 12 =
  the `entryFile` shell-out to `node` returned empty (node missing/broken or
  `node_modules` incomplete). It is an environment error, not a Gradle-version bug.

## Build & release (2026-11-09)

- EAS: CLI installed globally (`eas-cli 27.5.0`), already logged in as account
  `elyasyass`; project `@elyasyass/ContactsApp` resolves; Android keystore exists
  (`Build Credentials zU9YEfO_ft`). `eas.json` → `preview` profile builds an **APK**
  with `distribution: internal`.
- **BLOCKER discovered**: EAS build fails while uploading the project tarball —
  `403 AccessDenied` from `storage.googleapis.com` with
  "this service is not available in your location" (Google restricts the country).
  It is NOT an Expo account/keystore problem (GraphQL login + project reads work).
  Workarounds: a VPN/proxy on the phone (EAS reads lowercase `https_proxy`), or
  build on GitHub Actions (US runner, no upload → no block).
- GitHub: `origin` = `git@github.com:elyasyy23-lgtm/ContactsApp.git` (SSH key missing →
  push auth dead). `.github/workflows/build.yml` builds `app-release.apk` on
  ubuntu-latest with Node 22 + JDK 21 + prebuild + `assembleRelease`, uploads it as
  artifact `contactsapp-release-apk` (30 days). Triggered on any push.
- The working tree has `src/`, `scripts/`, `modules/`, `TASK.md` **untracked** — the
  GitHub repo does not contain the app source yet; a push must include them.
- 2026-11-09: GitHub token (scopes repo+workflow) stored in `~/.git-credentials`
  (credential.helper store) for user `elyasyy23-lgtm`; `origin` switched to HTTPS.
  `src/`, `modules/`, `scripts/`, `TASK.md` pushed — repo now holds the full app.
  Local history was rebased onto the remote `main`; conflicts in `build.yml` resolved
  by keeping the remote (Node 22 / JDK 21 / `assembleRelease`) version.
  → GitHub Actions "Build APK" run is the shipping path (EAS upload is geo-blocked).

## v12 — bilingual (fa/en) + sharing + swipe (2026-11-11, app 1.4.0 / code 11)

- **i18n**: `src/i18n/dict.js` maps the EXACT Persian source string → English.
  `t('متن فارسی')` is the only call form (Persian is the key, so the fa UI can
  never regress and a missing en key falls back to Persian, never blank).
  `src/i18n/index.js` holds module-level `lang` (`t`, `setLang`, `getLang`,
  `LANGUAGES`); `src/i18n/LanguageContext.js` = `LanguageProvider` + `useLang()`,
  persists `@app_language`, blocks render until hydrated (no fa→en flash) and calls
  `setLocale` from `src/utils/format.js`. Every screen/component that prints text
  must call `useLang()` so it re-renders on switch.
- **Locale-aware output**: `format.js` → `setLocale/getLocale/digits/money/jalaliDate/
  clockTime/dateTime`. fa = Jalali + Persian digits; en = Gregorian + Latin digits.
  Layout stays RTL in both (owner decision). Backup FILE names stay Gregorian/Latin
  (`backupFileName`) — filesystem-safe, intentional. Customer-facing SMS text stays
  Persian always (`smsParser`/`reminderGate` untouched).
- **Share**: `src/utils/share.js` (`APP_LINK`, `buildAppShareText`, `buildReceipt`,
  `canShare`). Settings → «اشتراک‌گذاری برنامه»; CustomerDetail → per-transaction
  share icon (`transactionShare`/`transactionEnd` styles). Receipts show Toman
  (`amount * TOMAN_PER_UNIT`), never ledger units.
  Share is **text only** (`react-native` `Share.share({message})`) — works in Expo Go
  and the APK; no file/`expo-sharing` needed. **Never nest a Touchable inside the row's
  Touchable**: on Android the parent swallows the child press (the receipt share icon
  silently opened the transaction sheet). The row is `View(transaction)` →
  `TouchableOpacity(transactionTap)` + sibling `TouchableOpacity(transactionShare)`.
  Known-good verify: `node scripts/verify.js` can't catch this class of bug — a device
  test is the only proof.
- **Green deposit banner**: `SmsInboxContext.recentAuto` entries now carry
  `contactId, bank, card, body, smsAt`. HomeScreen banner is a TouchableOpacity →
  Modal (customer, Toman amount, date/time, bank, raw SMS). Closing the modal calls
  `clearRecentAuto()` (acknowledge). Tapping a row opens that customer.
- **Swipe alphabet**: HomeScreen `usePanGesture` (RNGH **v3**, `Gesture.Pan()` is
  deprecated in 3.3.0) + `GestureDetector touchAction="pan-y"`; `activeOffsetX
  [-24,24]` / `failOffsetY [-18,18]` keep the vertical list scroll intact. Swipe
  LEFT = next letter, RIGHT = previous; chip bar auto-scrolls via measured
  `onLayout` x offsets (`chipsRef`).
  **`runOnJS: true` is mandatory in the pan config** — plain (non-worklet) callbacks
  otherwise crash Expo Go with `[Reanimated] Passed handlers that are not worklets.
  Handlers "onFinalize" are not worklets.` Bundle/verify pass green either way, so
  this only shows on a device.
- **Verify**: `npm run verify` = 45/45 files (parse + unbound-identifier audit +
  unit checks). It now also asserts the fa/en digit+calendar switch
  (`jalaliDate` fa `۱۴۰۵/۰۸/۱۱` vs en `2026/11/02`). Bundle gate:
  `npx expo export --platform android --no-bytecode` (plain Hermes fails on Termux).

## v1.5.0 shipped 2026-11-18 (rebrand + SMS exclusion + update checker + public site)

- Version 1.5.0 / versionCode 12 (app.json). Rebrand: name حسابیار, launcher label حسابیار,
  package stays `com.elyasyass.ContactsApp` (updates install in place). Manual SMS sender
  exclusion (`settings.excludedSmsSenders`, empty default; `isExcludedSender`/`normalizeSender`
  in `src/utils/smsParser.js`; `scanNow` skips an excluded sender but still marks it seen).
- In-app update checker: `src/utils/updateCheck.js` (`UPDATE_MANIFEST_URL =
  https://elyasyy23-lgtm.github.io/elyasyy-apps/ContactsApp/version.json`) +
  `src/components/UpdateNotice.js` (Persian modal; «بروزرسانی» opens `pageUrl`).
  `version.json` = `{latestVersion, downloadUrl, pageUrl}`. Bump `latestVersion` there to
  announce a release.
- CI `.github/workflows/build.yml`: versioned artifact `HesabYar-v<ver>-<code>.apk` + STABLE
  release asset `HesabYar-release.apk`; `softprops/action-gh-release@v2` on a `v*` tag;
  `permissions: contents: write`.
- Released: commit `7bf01a5` → `main` + tag `v1.5.0`; CI run `44339886541` SUCCESS.
  `HesabYar-release.apk` 49155385 B, sha256
  `a456b49bc9cd331de4cc5e5b34665f4cb99972e9dac1c5a1b3db208e0d959882`
  (package com.elyasyass.ContactsApp 1.5.0/code 12, minSdk 24 / targetSdk 36,
  arm64-v8a + armeabi-v7a). Delivered to `/storage/emulated/0/Download/HesabYar-release.apk`.
- Public site (elyasyy-apps Pages repo; originally FocusBlocker commit `7ab0ca7` → `main`): `contactsapp.html` detail page + `assets/hesabyar-icon.png`
  + `HesabYar-release.apk` at the repo ROOT + `ContactsApp/version.json` + `index.html`
  `.apptile` card (`apps.hesab.*` fa+en keys) + `sitemap.xml` entry. Migrated 2026-11-20; old FocusBlocker URLs redirect.
  LIVE: `https://elyasyy23-lgtm.github.io/elyasyy-apps/contactsapp.html`,
  `.../HesabYar-release.apk` (content-length 49155385, head+tail byte-identical to the
  verified local file), `.../ContactsApp/version.json`.
- Download path on this carrier: `~/gh-release-download.sh` (GitHub-first → ghproxy.net →
  gh-proxy.com, per-host sha256 gate). Watcher `~/watch-contacts.sh <runId> [tag]`.

## CCTV archive playback WIP (2026-11-19, owner request)
- Incremental feature only: keep SMS/ledger/navigation/existing i18n keys unchanged. Version stays
  1.5.0 / code 12 until the owner confirms Expo Go. Owner explicitly said 2026-11-20: "I haven't
  run the Expo Go test yet. Please wait, I will test it and let you know the result before you
  build anything." Release gate CLOSED: no bump/push/tag/CI/APK until that result arrives; `1`
  only selected candidate `1` = `archive-local`.
- DVR settings live in the existing `SettingsContext` / `@settings_data`: `dvrIp`, `dvrPort`,
  `dvrUser`, `dvrPassword`, `dvrSerial`. `normalize()` keeps ASCII values; no new store.
- Pure helpers: `src/utils/rtsp.js` (`transactionTimestamp`, `toDvrStamp`, `archiveWindow`,
  `buildArchiveUrl`, `maskRtspUrl`) and `src/utils/tvPlayback.js`
  (`buildTvPlaybackRequest`, `triggerTVPlayback`). `transactionTimestamp()` returns a valid raw
  string UNCHANGED (no `.000Z` rewrite), `null` when missing/invalid; non-string values use ISO.
  Archive starts 5 minutes before the transaction timestamp; default duration 10 minutes; TV CGI
  endpoint/payload stays empty/configurable until the owner supplies it.
  VERIFIED 2026-11-19 (read-only audit): the window is NOT user-configurable — no settings key
  exists (SettingsContext has only dvrIp/dvrPort/dvrUser/dvrPassword/dvrSerial), nothing in the
  UI edits it. `DEFAULT_ARCHIVE_LEAD_MINUTES = 5` / `DEFAULT_ARCHIVE_DURATION_MINUTES = 10`
  (rtsp.js:6-7) are the LIVE values: `CctvPlayerScreen` omits both args → defaults apply;
  `SettingsScreen.testDvrPlayback` hardcodes the same 5 / 10 explicitly. End = start + 10 min,
  so playback runs 5 min before → 5 min after the transaction (10 min total), e.g.
  tx 12:34:56 → 12:29:56Z…12:39:56Z. `scripts/verify.js:525-526` asserts both constants.
- ARCHIVE-PLAYBACK ROOT-CAUSE AUDIT 2026-11-19 (read-only, nothing changed): the app builds
  `rtsp://user:pass@<dvrIp>:<dvrPort>/cam/realmonitor?...&starttime=<UTC Z>&endtime=<UTC Z>`.
  THREE independent defects, in order of certainty:
  1. PORT CONFLATION — there is only `dvrPort` (default `34567`, the DVRIP control port) and it is
     used as the RTSP port (`SettingsContext` has no `rtspPort`; `grep 554` = 0 hits). RTSP on a
     Xiongmai box listens on **554**; 34567 speaks the binary DVRIP protocol, so VLC talks RTSP to a
     non-RTSP service and fails instantly (`playback_multiple_errors` is VLC's generic 2-error toast).
  2. NO RTSP ARCHIVE ON XM — Xiongmai firmware serves LIVE over RTSP (`/user=U&password=P&channel=1&
     stream=0.sdp?real_stream`; Dahua-style `/cam/realmonitor` accepted but `subtype` silently
     ignored). Archive is only via DVRIP `OPFileQuery` (1440) + `OPPlayBack` (claim 1424 /
     start 1420, `PlayMode: "ByName"`, raw H.264-over-TCP frames). The `starttime/endtime` params on
     `/cam/realmonitor` are NOT a XM feature — `/cam/playback` + underscore timestamps is DAHUA.
  3. TIMEZONE — `toDvrStamp()` emits UTC `...Z`, but the DVR's own clock/records are device-local;
     DVRIP `StartTime` is `YYYY-MM-DD HH:MM:SS` local. `createdAt` is stored as `toISOString()` (UTC),
     so even a working playback would land 3.5 h off in Iran.
  Consequence: no amount of URL tweaking makes archive work in Expo Go — it needs a native build
  (TCP socket + DVRIP client + decoder). Live RTSP support does NOT imply archive support.
- Owner RTSP template:
  `rtsp://[User]:[Pass]@[IP]:[Port]/cam/realmonitor?channel=1&subtype=0&starttime=[YYYYMMDDThhmmssZ]&endtime=[YYYYMMDDThhmmssZ]`.
- Exact labels: Settings `Test TV Playback`; per-transaction camera control on
  `CustomerDetailScreen` uses `accessibilityLabel`/tooltip `پخش فیلم دوربین`. The general
  customer-level button is REMOVED. Each row opens `CctvPlayer` with that row's exact
  `createdAt` timestamp; invalid times show `زمان تراکنش نامعتبر` and a graceful alert. Camera
  control is a sibling touchable of the row/share/delete controls; never nest touchables.
- Persian RTL UI uses explicit `row-reverse`, right-aligned text, `writingDirection:'rtl'`; inputs
  stay LTR/ASCII with `asciiInput`; never force RTL globally.
- Expo Go must render JS/UI safely; native RTSP/video playback may not work there. APK/CI build is
  gated on the owner's explicit Expo Go confirmation.
- 2026-11-19 root-cause fix: `src/screens/CctvPlayerScreen.js:137` crashed with `undefined is not a
  function` because it did `const { t } = useLang()`. `useLang()` from
  `src/i18n/LanguageContext.js` returns `{ lang, setLang, isEn, ready }`, NOT `t`; `t` is imported
  directly from `src/i18n`. Fixed in both `CctvPlayerScreen.js` and `UpdateNotice.js`:
  `import { t } from '../i18n';` + `useLang(); // re-render when the app language changes`.
  NEVER destructure `t` from `useLang()` in this project.
- Latest verification after the per-transaction rewire and raw-timestamp fix: `npm run verify`
  = `parse: 50/50 files ok`, `unbound identifiers: checked`, `unit checks: ok`, ALL CHECKS PASSED.
  Final Android dev bundle on port 8082: `bundle_http=200 bundle_bytes=9128407`; tokens
  `transactionTimestamp=3`, `openTransactionCctv=2`, `transactionCctv=2`,
  `Invalid transaction time=1`, `CctvPlayerScreen=9`.
- Metro must be restarted PID-targeted ONLY for ContactsApp port 8082 with
  `env CI=1 EXPO_NO_TELEMETRY=1 npx expo start --host localhost --port 8082 --clear`
  (`exp://127.0.0.1:8082`). CI mode disables file watching; restart after code edits. A second
  Expo watcher hits inotify `ENOSPC`; do not kill unrelated processes (HayatAlSahabah stays on 8081).
- Owner Expo Go confirmation is still pending; no push/tag/CI/APK build has been done.
- XM RTSP/archive research (2026-11-19): GitHub code search found `Moxnatiy/hass-xmeye/docs/protocol.md` (live-measured on NBD8008R-U firmware `V4.03.R11.061B0197`) and `whatisor/rtsp-url-formats/README.md`. Confirmed: XM DVRIP control port is TCP `34567`, RTSP is `554`; native XM live RTSP is `rtsp://IP:554/user=USER&password=PASS&channel=1&stream=0.sdp?real_stream`; Dahua-style `/cam/realmonitor?channel=1&subtype=0` is accepted but `subtype` is ignored. NOT confirmed: XM supports RTSP archive `starttime/endtime`; those query params belong to Hikvision/Dahua playback paths. Real XM archive playback uses DVRIP `OPFileQuery` (1440) + `OPPlayBack` (1424/1420/1422), `ByName` with a real recording path (ByTime ignores channel), returning raw DVRIP frames. Current black screen has two independent causes: unverified/unsupported archive URL (using DVRIP port `34567` inside `rtsp://`) and no native RTSP/video decoder in `CctvPlayerScreen`. Do not claim playback works.
- **CCTV PLAYBACK — MEASURED PROTOCOL MAP for the owner's DVR (2026-11-19, read-only)**
  Device: **AHB7804R-MH-V2**, 8 channels (cameras on 1-4), LAN IP **192.168.1.139**.
  Full TCP scan (all 65535 ports, 41 s) → open: **554, 9080, 9530, 34286**. `34567` is CLOSED
  (connection refused) — the port the app uses by default.
  - **554** = RTSP, banner `Server: H264DVR 1.0`, `Public: OPTIONS, DESCRIBE, SETUP, TEARDOWN,
    GET_PARAMETER, SET_PARAMETER, PLAY, PAUSE`; every DESCRIBE (even `/nope/xyz`) answers
    `401` + `WWW-Authenticate: Digest realm="6485006c05b0ff6f"` → auth is checked before the path,
    so RTSP path validity cannot be probed without credentials. Live streams only.
  - **34286** = **DVRIP** (proved: 0xFF magic header + msgid 1001 reply + `Ret 203` = "Password is
    incorrect" for an empty password). This is the archive/control channel XMEye talks to.
  - **9080** = HTTP, NetSurveillance web UI (`LogoString 'NetSurveillance'`, `/m.jsp`,
    `LoardAddress=http://xmsecu.com:8080/ocx/NewActive.exe`) — its playback needs that Windows
    ActiveX plugin, i.e. even the vendor's own web UI does not do archive over RTSP.
  - **9530** = accepts TCP then resets on any payload; no HTTP/TLS/DVRIP reply (unknown proprietary).
  - Evidence that XM playback is native-protocol only: `hatcha6/pointy` driver —
    `supports_playback = True` / `playback_is_streamed = True` with the comment "Playback goes over
    the native protocol, not RTSP ... Live tiles come from ffmpeg over RTSP";
    `Moxnatiy/hass-xmeye` protocol.md (measured on V4.03.R11) — `OPPlayBack` 1420/1424, `ByName`;
    `whatisor/rtsp-url-formats` lists XM RTSP as LIVE ONLY (playback URLs exist only for Dahua);
    `StrixCamDB` NetSurveillance entry = live/snapshot URLs only. ⇒ **never claim RTSP archive.**
  - Channel numbering: **RTSP is 1-based**; **DVRIP `Channel` is 0-based** (protocol.md, dvrip.py).
    App has `DEFAULT_ARCHIVE_CHANNEL = 1` (`src/utils/rtsp.js:4`) and NO channel setting → only
    camera 1 can ever be requested; cameras 2-4 are unplayable by design.
  - CORRECTION to the earlier "no LAN host reachable" note: that sweep ran while the DVR was off/on
    another path; the DVR IS reachable now (554 answers, ICMP fine). Do not reuse that conclusion.

### RTSP port split + playback candidates (2026-11-19, verified, Expo Go pending)
- `src/utils/rtsp.js` owns the URL truth: `DEFAULT_RTSP_PORT='554'`, `DEFAULT_DVRIP_PORT='34567'`,
  `DEFAULT_CHANNEL_COUNT=4`, `rtspPortOf()` / `dvripPortOf()` / `channelOf()` (clamped 1–4).
- `toDvrStamp(value, {utc})` → **local** basic stamp by default; `toDahuaStamp()` → `YYYY_MM_DD_HH_MM_SS`;
  `archiveWindow()` returns `startTime`/`endTime` (local) + `startTimeUtc`/`endTimeUtc` + Dahua stamps.
- `buildArchiveUrl({timeMode:'local'|'utc', template})`, `buildLiveUrl({style:'xm'|'dahua'})`,
  `buildPlaybackCandidates()` → `[archive-local, archive-utc, playback-local, live-xm]`.
  `maskRtspUrl()` masks `user:pass@` AND `password=` query values.
- Store: `SettingsContext` persists `rtspPort` + `dvrChannel`; Settings UI has «پورت RTSP» + channel chips;
  `tvPlayback` uses `port` for the CGI endpoint, `rtspPort` for the video URL.
- `CctvPlayerScreen` shows «گزینه‌های پخش» (play/copy per candidate) because the box is an Xiongmai whose
  RTSP server documents only live streaming — the archive path is settled by trying, not guessing.
- Measurements that drove this: TCP open = 554, 9080, 9530, 34286 (**34567 refused**); 554 answers
  `Server: H264DVR 1.0` and returns `401` for EVERY path before path validation; 34286 answers DVRIP
  (msgid 1001, `Ret 203` on empty password). Channel bases: RTSP 1-based, DVRIP/web 0-based.

### VLC IS THE PLAYER — archive playback without the password prompt (2026-11-20, owner order)
- OWNER DECISION (supersedes the embedded-player work): **VLC stays the shop owner's video player.**
  Do not add an in-app video player and do not remove VLC. `CctvPlayerActivity.kt` was DELETED and its
  `<activity>` entry removed from `modules/cctv-playback/android/src/main/AndroidManifest.xml`; the
  module now only *fetches* a recording (`playArchive` → local file) and opens URIs (`openInVlc`).
- ROOT CAUSE of VLC's «RTSP authentication» dialog (measured against the working live URL): the live
  URL carries the credentials in the **PATH** (`rtsp://ip:554/user=admin&password=…&channel=1&stream=0.sdp?real_stream`),
  so VLC never sees a userinfo component and never starts its own auth. All three archive formats used
  `user:pass@` **userinfo**, which VLC drops for RTSP, so VLC answered the DVR's `401 Digest` itself
  and showed its login dialog. Fix = match the live URL's credential shape.
- `src/utils/rtsp.js`: new `XM_ARCHIVE_RTSP_TEMPLATE` =
  `rtsp://[IP]:[Port]/user=[User]&password=[Pass]&channel=[Channel]&stream=[Subtype].sdp?real_stream&starttime=[StartTime]&endtime=[EndTime]`
  + `buildXmArchiveUrl()` (reuses `archiveWindow`, local stamps, no `Z`). `buildPlaybackCandidates()`
  order is now `[archive-xm-path, archive-local, archive-utc, playback-local, live-xm]` — the
  path-credential candidate is FIRST because it is the only one that cannot trigger the VLC prompt.
  `maskRtspUrl()` still masks `password=` (verified).
- `src/utils/vlc.js` (new): `openInVlc(url, {mimeType})` and `openLocalFileInVlc(path, …)`.
  Local clips go through `FileSystem.getContentUriAsync` → `content://` and are opened by the native
  `openInVlc`, which adds **`FLAG_GRANT_READ_URI_PERMISSION`** (React Native's `Linking` does NOT, so
  VLC gets permission-denied on app-private files). Verified the authority/paths cover the clip:
  `expo-file-system` 58.0.13 provider `${applicationId}.FileSystemFileProvider`, paths
  `<cache-path path=".">` and the module writes to `cacheDir/cctv/clip-*.h264`.
- `CctvPlayerScreen.js`: primary card = «دریافت آرشیو و پخش در VLC» (DVRIP download → VLC on the local
  file, prompt-free by construction); «گزینههای پخش» rows gained a ▶ button that hands each RTSP
  candidate straight to VLC (plus the existing copy). `CANDIDATE_LABELS` gained
  `'archive-xm-path'`. In Expo Go the DVRIP download is unavailable and the screen says so.
- i18n: +9 `dict.js` keys (fa→en) for the new VLC strings; `npm run verify` = **55/55 ALL CHECKS PASSED**
  (candidate-order asserts updated + `no userinfo on the primary candidate`).
- Metro on **8082 only** (PID-targeted kill; 8081 untouched, both 200). Warm Android dev bundle
  200 / 10,151,499 B containing `openLocalFileInVlc`, `archive-xm-path`, `buildXmArchiveUrl`,
  `FLAG_GRANT`; `CctvPlayerActivity` occurrences = 0.
- OPEN: on-device test not done. Unknown whether this firmware honours `starttime/endtime` on the XM
  path URL (device question) — the candidate list exists to settle it by pressing ▶ in VLC.
  Release gate still CLOSED: no bump/push/tag/CI/APK.

## CCTV debt-clip feature (2026-11-20) — test APK built, release STILL CLOSED
- OWNER ORDER (2026-11-20): the camera icon is for DEBT transactions only — a payment has no
  goods hand-over to review. Implemented in `CustomerDetailScreen.js` `renderTransaction`:
  `const isDebt = item.type === TRANSACTION.CREDIT;` and the icon is `{isDebt ? (…) : null}`.
  Payments / purchases / other types show only the receipt share. (TRANSACTION.CREDIT = «ثبت بدهی»,
  TRANSACTION.PAYMENT = «دریافت پرداخت» — CREDIT is the debt.)
- WINDOW FIXED BY THE OWNER: exactly **5 minutes before** the transaction and **5 minutes after**.
  `src/utils/rtsp.js` gained `DEFAULT_ARCHIVE_TAIL_MINUTES = 5`; `DEFAULT_ARCHIVE_DURATION_MINUTES`
  = LEAD + TAIL = 10 and is still the default whole span, so `archiveWindow()` accepts either an
  explicit `tailMinutes` or a `durationMinutes`. Return value now also carries `leadMinutes` /
  `tailMinutes` for UI + logging. GOTCHA that cost one verify cycle: do NOT drop the
  `durationMinutes = DEFAULT_ARCHIVE_DURATION_MINUTES` default while adding `tailMinutes` — the
  default window then falls back to 1 minute and the end lands 5 min early (verify caught it).
- NATIVE CLIP IS THE WINDOW, NOT THE WHOLE FILE (`DvripClient.kt`): `DEFAULT_FPS = 25`,
  `parseStamp(value): Long?`, `framesFor(ms, fps)`; `claim()`/`playbackBody()` now take the
  `startTime` stamp; `segmentsFor(files, startMs, endMs)` picks every recording file the window
  intersects (a window can straddle two files → both are played back to back);
  `downloadRange(file, target, startMs, frameBudget, byteLimit, onProgress)` stops on the frame
  budget and falls back to a byte cap when the firmware emits no Annex-B slice headers
  (`countSlices()` scans NAL 1/5 with a `scanTail` carry-over across chunks).
- `CctvPlaybackModule.kt` `playArchive` thread: one query client for the file list (logged out and
  closed before downloading — the DVR allows one session per pair), then a FRESH `DvripClient` per
  segment appending into ONE `cacheDir/cctv/clip-*.h264`; progress + stage events carry
  `frames`/`framesTotal`; resolve payload = `ok,path,file,bytes,begin,end,segments,frames,
  framesTotal,fps,startMs,endMs`; empty result deletes the file and rejects.
- `scripts/verify.js` asserts all of it (tail constant, lead+tail duration, ±5 min offsets, explicit
  tail form, the `isDebt` guard wrapping the icon) → `npm run verify` = **55/55 ALL CHECKS PASSED**.
  Metro 8082 restarted with `--clear` (cached bundle served stale code before the restart — always
  restart after source edits) → warm bundle 10,152,473 B with `isDebt = item.type === …CREDIT`
  (babel rewrites the import, so grep for `TRANSACTION.CREDIT`, not the literal source string).
- COMMITTED `0b7dd32` on branch **feat/cctv-debt-clip** (pushed, NOT main, NOT tagged) → CI run
  **44790900851**. TEST APK ONLY: the artifact (`HesabYar-v1.5.0-12`) is downloaded by
  `~/watch-hesabyar-artifact.sh <runId> [name]` → `/storage/emulated/0/Download/HesabYar-cctv-test.apk`;
  no release, no version.json change, no site change. Release gate from 2026-11-20 still CLOSED.
- CI cycle 1 (run 44790900851) FAILED on `:cctv-playback:compileReleaseKotlin`: `promise.reject(code,
  message)` has no 2-arg overload in expo-modules-core (`reject(code, message, cause)` or
  `reject(CodedException)`). All 6 call sites fixed with a `null` third argument → commit `1f1a43e`
  → run **44794432097 SUCCESS (~7 min)**. Signatures were verified straight out of
  `node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/{Promise,modules/Module}.kt`
  BEFORE pushing the fix — that is the only "compiler" available on this phone; skill written:
  `expo-local-module-kotlin-ci`.
- TEST APK (2026-11-20, NOT published): artifact `HesabYar-v1.5.0-12` downloaded by
  `~/watch-hesabyar-artifact.sh <runId> [name]` → `/storage/emulated/0/Download/HesabYar-cctv-test.apk`
  **49,288,801 B**, sha256 `6b7fefa4aabe00b1307a871e0fe2b4eac0a45ed4b8e49110a0a6bee9ddc72b6d`,
  package `com.elyasyass.ContactsApp` 1.5.0 / code 12, label حسابیار, minSdk 24 / targetSdk 36,
  **v2-signed with the SAME template debug cert `fac61745…` → installs over 1.5.0 with data intact**.
  Native module really shipped (R8 renames classes, so grep the STRING constants, not the class
  name): `classes.dex` contains `onCctvEvent`, `DVR address is empty`, `E_DVRIP`, `org.videolan.vlc`,
  `cctv-playback_release`.
