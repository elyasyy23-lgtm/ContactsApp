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
