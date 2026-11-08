This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

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
- Consequence: pushing via `git` needs credentials. **The user's GitHub email is locked, so
  they cannot create a PAT** — use SSH instead: key `~/.ssh/id_ed25519` was generated on
  2026-11-08 (fingerprint `SHA256:erxMmACvMnNGnCAvNXutNWXKDeICqW20LNJVfjsQbG8`).
  Status 2026-11-08: user said the key was added, but `ssh -T git@github.com` returns
  `Permission denied (publickey)` — GitHub reached, key offered, not accepted ⇒ the key is
  not attached to the `elyasyy23-lgtm` account (wrong account, added as a *signing* key, or
  truncated paste). Verify the fingerprint on https://github.com/settings/keys.
  `gh` CLI 2.103.3 is now installed (`gh auth login` = OAuth device flow, no token page).
  Once authenticated: `gh auth setup-git && git push -u origin main`.

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
