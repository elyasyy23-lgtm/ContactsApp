# TASK — ContactsApp / eKhata (Persian UI + Toman + auto SMS + Settings + Premium)

GOAL (v2 requirements, 2026-11-09): finish the eKhata-style customer-ledger app with
(1) 100% Persian UI, (2) Toman everywhere (no Rial), (3) automatic SMS reminder when a
customer's debt passes 1,000,000 Toman using the exact Persian template, (4) a Settings
screen (my name / card number / shop name) with SettingsProvider wrapping the
NavigationContainer (fixes "useSettings must be used inside SettingsProvider"),
(5) Premium screen with Myket/Cafe-Bazaar IAP placeholder, free plan capped at 10 customers.

STATUS: DONE 2026-11-09. All checks green, dev server running in tunnel mode.

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

## NOW:
Native module + JS pipeline complete and offline-verified. Remaining: build the APK
on a PC/EAS and grant the SMS permission once.
