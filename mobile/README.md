<div align="center">

# ⚖️ LMCC Mobile — Native Port

### React Native (Expo) port of the LMCC web app — one backend, one account, every device

[![Expo](https://img.shields.io/badge/Expo-SDK%2057-000)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61dafb)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)](https://www.typescriptlang.org)
[![Smart India Hackathon](https://img.shields.io/badge/SIH-26034-8b5cf6)](https://www.sih.gov.in)

</div>

---

## 🧐 What is this?

The native mobile client of **LMCC — Legal Metrology Compliance Checker**
(the Next.js app in the repo root). It is a *port*, not a rewrite of the
backend: the app talks to the **same `/api/*` routes**, signs in with the
**same account**, and sees the **same scan history** as the web app.
Photograph a label in the store, audit it on the spot, review the verdict,
and export a stamped report — then continue on the web with everything
already there.

**Stack:** Expo SDK 57 · React Native 0.86 · expo-router (file-based tabs) ·
TypeScript · `@noble/hashes` · no UI library (hand-rolled dark theme that
mirrors the web palette).

---

## ✨ Feature parity

| Web feature | Mobile port |
|---|---|
| Email/password auth (PBKDF2 verifier derived **on-device**, 150k iters) | ✅ identical protocol — same verifier bytes, verified against the backend (`scripts/e2e-protocol.mjs`) |
| httpOnly cookie sessions | ✅ cookies live in the OS cookie jar (persist across app restarts) |
| 2FA (TOTP QR + 10 single-use backup codes) | ✅ full setup/disable/backup-code flow |
| Forgot password via 3 security questions | ✅ ticket flow, same endpoints |
| Change password (other devices logged out) | ✅ |
| Scan product (photo → extraction → rules engine) | ✅ camera + gallery → server-side AI vision (`/api/vision-fallback`) → local rules engine. **Local Tesseract OCR is browser-only**, so on-device OCR is replaced by the AI path; the fully-offline equivalent is the manual Audit tab |
| Rules engine (field verdicts, rule refs, severity, notes) | ✅ the exact same `compliance-rules.ts` engine, copied 1:1 |
| Product Declarations Audit (manual form, live preview) | ✅ all 13 declarations, live per-field verdicts |
| Review Queue (officer approve/override) | ✅ override re-runs the deterministic check |
| Scan History (filter, search, edit, delete) | ✅ edit re-runs the engine and updates in place |
| Cross-device scan sync (`/api/scans` push/pull merge) | ✅ same union-merge, local-wins semantics |
| Dashboard (stats, violation breakdown, recent scans) | ✅ |
| Stamped exports (PDF/CSV with producer identity) | ✅ PDF via `expo-print` HTML→PDF, CSV via the new `expo-file-system` File API, shared through the OS share sheet |
| AI Providers (bring-your-own-key) | ✅ same `lmcc-ai-providers` store shape; keys stay on the device and only travel through the SSRF-guarded server relays |
| Legal Reference (officer-only) | ✅ full offline rules, penalties, amendments |
| Lite mode / keyboard shortcuts / easter eggs | ➖ web-specific, not ported |
| OCR training-pairs capture & ZIP export | ➖ web-only (ties into the tesstrain pipeline) |
| Contact form → GitHub issue | ➖ web-only |

---

## 🚀 Run it

### 1 · Start the backend (repo root)

```bash
# in the repo root — the mobile app is a client of this server
npm run dev          # → http://localhost:3000
```

### 2 · Start the mobile app

```bash
cd mobile
npm install
npx expo start
```

Then scan the QR code with **Expo Go** (Android/iOS), press `a` for the
Android emulator, or `i` for the iOS simulator.

### 3 · Point the app at your backend

The app auto-detects the server URL:

| Setup | Server URL used |
|---|---|
| Real device on the same Wi-Fi (Expo Go) | `http://<your-computer-LAN-IP>:3000` — derived from the Expo dev server host, zero config |
| Android emulator | change to `http://10.0.2.2:3000` (emulator's alias for your machine) |
| Production / deployed backend | paste the public URL in **Settings → LMCC Server** (or on the login screen) |

The URL is editable on the login screen and in Settings, and is remembered
across restarts.

### Scripts

```bash
npm run typecheck   # tsc --noEmit — full project type check
npm run e2e         # protocol check against a running backend (no device needed):
                    # challenge → register → cookie session → scans push/pull → logout → login
```

---

## 🏗️ Architecture

```
mobile/
├── app/                        # expo-router routes
│   ├── _layout.tsx             # boot: storage hydrate + API base → AuthProvider → Stack
│   ├── index.tsx               # auth gate → (tabs) or /login
│   ├── login.tsx               # sign in · register · forgot password · TOTP step
│   ├── (tabs)/
│   │   ├── _layout.tsx         # bottom tabs (session-guarded)
│   │   ├── dashboard.tsx       # stats, violation breakdown, officer shortcuts
│   │   ├── scan.tsx            # camera/gallery → AI vision → rules engine
│   │   ├── audit.tsx           # manual declarations form w/ live verdicts
│   │   ├── history.tsx         # filter/search/export/delete
│   │   └── settings.tsx        # account · server · AI status · sign-out
│   ├── scan/[id].tsx           # compliance report + review/edit/PDF/CSV
│   ├── review.tsx              # officer review queue
│   ├── legal.tsx               # offline legal reference (officer-only)
│   └── settings/{security,providers}.tsx
├── src/
│   ├── lib/                    # ported core — the heart of the port
│   │   ├── types.ts            # ← copied 1:1 from ../src/lib
│   │   ├── compliance-rules.ts # ← copied 1:1 (the rules engine)
│   │   ├── extract/types.ts    # ← copied 1:1
│   │   ├── legal-data.ts       # ← copied 1:1
│   │   ├── hooks.ts            # ← copied 1:1 (useSyncExternalStore works in RN)
│   │   ├── local-data.ts       # ← copied, `window.localStorage` swapped for
│   │   │                       #    a synchronous shim (storage.ts)
│   │   ├── scan-sync.ts        # ← copied, fetch → apiFetch(base URL + cookies)
│   │   ├── storage.ts          # NEW: localStorage-shaped shim over AsyncStorage
│   │   ├── api.ts              # NEW: server-URL config + cookie fetch layer
│   │   ├── auth-crypto.ts      # PORT: WebCrypto PBKDF2 → @noble/hashes (same bytes)
│   │   ├── auth.tsx            # PORT: AuthProvider on the same endpoints
│   │   ├── ai-providers.ts     # BYOK store ('lmcc-ai-providers', web-compatible)
│   │   └── export.ts           # CSV + print-ready PDF via expo-print
│   ├── components/ui.tsx       # buttons, badges, cards, sheets, overlays
│   └── theme.ts                # dark palette mirroring the web tokens
└── scripts/e2e-protocol.mjs    # contract test against a live backend
```

### Porting rules (keep them true when either side changes)

1. **Shared engines are copies, not symlinks** — `types.ts`,
   `compliance-rules.ts`, `extract/types.ts`, `legal-data.ts`, `hooks.ts`,
   `local-data.ts`, and `scan-sync.ts` originate in `../src/lib`. If the web
   engine changes, copy it over again and re-apply the two mechanical swaps:
   `window.localStorage` → `localStore` (from `./storage`) and
   `fetch('/api/…')` → `apiFetch('/api/…')` (from `./api`).
2. **Same wire protocol** — request/response shapes must match the web app
   exactly; `npm run e2e` asserts the whole flow against a live backend.
3. **Same crypto** — the PBKDF2-SHA256 verifier (150,000 iterations, 256-bit,
   per-user server salt) is byte-identical to the browser's WebCrypto output;
   the server cannot tell the clients apart.

### Session & security notes

- The raw password never leaves the device — only the derived verifier (✓ in
  the e2e log).
- The httpOnly session cookie is managed by the native networking layer's
  OS cookie jar — no tokens in JS-land, persisted across restarts, wiped on
  sign-out *for this device only* (the account copy stays server-side).
- AI provider keys are stored only on the device (same store key and shape
  as the web app) and only ever sent to the backend's SSRF-guarded relays.
- **Scanning sends the label photo to the configured AI vision model** via
  your backend (built-in default model or your own key) — identical data flow
  to the web app's AI/Hybrid modes. The manual Audit tab is fully offline.

### Known environment note

`expo-doctor` reports a *duplicate* `react` because the parent repo (the
Next.js web app) has its own `node_modules` one level up. Metro resolves
`react` from `mobile/node_modules` (19.2.3), so this is cosmetic for the
mobile build; installing with `--legacy-peer-deps` avoids npm's strict
peer resolution tripping over the sibling web tree.

---

## 📱 Building a signed release APK

The repo ships a one-command release pipeline that produces a **release APK
signed with its own dedicated keystore** — the single most important factor
in how Google Play Protect judges a sideloaded APK. Unsigned or debug-signed
builds (Gradle's default for `assembleRelease`!) are exactly what triggers
Play Protect's hard *"Unsafe app blocked"* verdict; a properly signed
release build gets past the scan.

### Prerequisites (one-time, this machine already satisfies them)

- **JDK 17** and an **Android SDK** with NDK (`ANDROID_HOME` set)
- **cmake 3.31.6** in the SDK: `sdkmanager --install "cmake;3.31.6"`
  — the default cmake 3.22.1 bundles ninja 1.10, which hard-fails on this
  repo's long generated object paths ("Filename longer than 260 characters");
  cmake 3.31.6 bundles the long-path-aware ninja 1.12.1. Windows must have
  `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem → LongPathsEnabled = 1`
  (the default on current Windows 10/11 dev setups).

### Steps

```bash
# 1 · generate the release keystore (ONE-TIME — this machine already has it;
#     see keystore/RELEASE_CREDENTIALS.txt for the password)
keytool -genkeypair -storetype PKCS12 -keystore keystore/lmcc-release.keystore \
  -alias lmcc -keyalg RSA -keysize 2048 -validity 10000

# 2 · regenerate the native project + wire release signing, cleartext HTTP,
#     and the cmake pin in one idempotent command (re-run after every prebuild)
npx expo prebuild --platform android --no-install
node scripts/apply-android-signing.mjs

# 3 · build
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`
(com.abhinavdatta.lmcc, versionCode 1). Verify the signature with:

```bash
"$ANDROID_HOME/build-tools/<ver>/apksigner" verify --print-certs app-release.apk
```

> A store/APK build has no Expo dev server: before shipping, open **Settings →
> LMCC Server** on the device and point it at your deployed backend (e.g. the
> Vercel URL) — the override persists in app storage. If the backend is
> HTTPS-only, you can delete `android/app/src/release/AndroidManifest.xml`
> (written by the signing script) to forbid cleartext traffic entirely.

### What makes this APK Play Protect-friendly

| Factor | This build |
|---|---|
| Signed with a **unique release keystore** (not the public debug key) | ✅ `keystore/lmcc-release.keystore` (RSA-2048, PKCS12) |
| Package name that doesn't impersonate another identity | ✅ `com.abhinavdatta.lmcc` (app.json no longer uses the `in.gov.…` name — a gov-domain package is a classic impersonation red flag) |
| Release, not debug, build type (no `android:debuggable`, no test-only flags) | ✅ `assembleRelease` with R8/Hermes defaults |
| Modern signature schemes (v1+v2+v3) | ✅ default AGP signing |
| Minimal, explainable permissions | ✅ final APK requests only `CAMERA`, `INTERNET`, `ACCESS_NETWORK_STATE`, and legacy (≤ Android 12) storage for gallery picks — Expo's template strays (`SYSTEM_ALERT_WINDOW`, `VIBRATE`, `RECORD_AUDIO`) are stripped by the signing script + `expo-camera`'s `recordAudioAndroid: false` |

**Honest expectation-setting:** Play Protect still shows its standard
sideload caution ("Play Protect doesn't recognise this app — more details →
Install anyway") for *any* APK that didn't come from the Play Store — no
signing choice can remove that, because it's inherent to sideloading. What
proper release signing *does* remove is the technical red flags that make
Play Protect hard-block the install or flag the app as harmful. If you ever
publish to the Play Store, upload this same keystore's app to Play App
Signing and the caution disappears entirely for Play-installed copies.

### Keystore hygiene (important)

- `keystore/` (keystore + `RELEASE_CREDENTIALS.txt`) is **gitignored — never
  commit it, never lose it.** A lost keystore means every future build needs
  a new key, so users must uninstall/reinstall; Play Store updates would be
  rejected without Play App Signing.
- Same key ⇒ same app identity: all future LMCC APKs you hand out must be
  built with this keystore, or Android will refuse to update over an
  installed copy.

---

## 👤 Author

**Smart India Hackathon 2026** — problem statement **SIH26034**,
Dept. of Consumer Affairs, Government of India ·
[github.com/abhinavdatta](https://github.com/abhinavdatta)

*Hackathon project — provided as-is, no warranty. Not legal advice; verify
compliance determinations against the official Rules text.*
