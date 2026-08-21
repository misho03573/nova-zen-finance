# NOVA — Mobile & App Store Readiness

Status of Phase 8. NOVA today is a mobile-first web app (PWA-ready) that is
structured so a Capacitor wrapper can be added without rewriting feature code.

## 1. What is done

| Area | State | Where |
| --- | --- | --- |
| Safe areas (notch, Dynamic Island, home indicator) | Done — `safe-top`, `safe-bottom`, `--nav-clearance` tokens | `src/styles.css`, `src/components/nova/AppShell.tsx` |
| Dynamic viewport height | Done — `min-h-dvh-screen` instead of `h-screen` | all route shells |
| Touch targets | Done — `tap` utility enforces 44x44 under `(pointer: coarse)` | `src/styles.css` + 32 controls |
| Sheets & dialogs | Done — capped height, internal scroll, keyboard-safe | `src/components/ui/dialog.tsx`, `sheet.tsx` |
| Bottom navigation | Done — fixed, safe-area padded, no content occlusion | `AppShell.tsx` |
| PWA manifest + icons | Done — 32/64/180/192/512/1024 + maskable | `public/manifest.webmanifest`, `public/icons/` |
| Apple mobile meta | Done — `apple-mobile-web-app-*`, `viewport-fit=cover`, theme color | `src/routes/__root.tsx` |
| Offline / sync state | Done — honest saved / saving / error / offline reporting | `src/lib/sync-status.ts`, `SyncIndicator.tsx` |
| Capability abstraction | Done — single source of truth for web vs. native features | `src/lib/native.ts`, surfaced in `/diagnostics` |
| Accessibility | Done — labelled icon buttons, semantic landmarks, token-based contrast | project-wide |

Verification: 130 unit tests pass, i18n checks report 0 violations, and a
Playwright sweep of all 23 routes at 390x844 / 393x852 / 430x932 shows no
horizontal overflow, no console errors, and no content hidden behind the tab bar.

## 2. Blockers for a real native build

These are **not** implemented and must not be advertised as working:

1. **Receipt OCR / camera** — `/scan` is a simulation. Needs `@capacitor/camera`
   plus an OCR plugin (ML Kit on Android, Vision on iOS).
2. **Push & local notifications** — the Notification Center is in-app only.
   Needs `@capacitor/local-notifications` and `@capacitor/push-notifications`.
3. **Face ID / Touch ID** — the settings toggle stores a preference only.
   Needs `capacitor-native-biometric` and a real lock screen gate on resume.
4. **PIN lock enforcement** — the PIN is stored but no lock screen blocks the app.
5. **NOVA AI** — rule-based responses, not an LLM. Label as beta or wire a model.
6. **Automation rules** — persisted but they do not move money on a schedule.

## 3. Capacitor wrapper checklist

Capacitor is now configured — see [NATIVE_BUILD.md](./NATIVE_BUILD.md) for the
full workflow. Dependencies are installed, `capacitor.config.ts` exists
(`appId: app.nova.finance`, placeholder), and `bun run build:native` emits the
static bundle at `dist/native` that `cap sync` copies into the native projects.
`ios/` and `android/` are generated on demand with `bunx cap add <platform>`.

- Build target must be the static client build; server functions stay on the web
  origin and are reached over HTTPS from the WebView.
- `server.androidScheme = "https"` so Supabase auth storage stays on one origin.
- Deep link / OAuth redirect must be registered for Google sign-in
  (`app.nova.finance://auth` plus the hosted callback).
- Declare permissions: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSFaceIDUsageDescription`, `android.permission.CAMERA`, `POST_NOTIFICATIONS`.
- Splash screen and app icon: generate from `public/icons/icon-1024.png`.

## 4. Store submission assets still to produce

- Screenshots: 6.7" and 6.1" iPhone, 12.9" iPad, Android phone + tablet.
- App Store description, keywords, support URL, marketing URL.
- Privacy policy and a data-collection disclosure (Supabase auth + financial
  data stored per user; no third-party analytics today).
- Age rating questionnaire and a demo account for review.
- Because NOVA handles financial data, expect review questions about data
  storage location, encryption in transit, and account deletion — account
  deletion must exist in Settings before submission.
