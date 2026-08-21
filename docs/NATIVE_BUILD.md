# NOVA — Native Build (Capacitor)

NOVA stays a normal web app. Capacitor is an *additional* packaging path that
wraps the same code in an iOS/Android WebView. Nothing in this document changes
the deployed web version.

Current bundle identifier: **`app.nova.finance`** — PLACEHOLDER. Replace it with
the identifier registered in App Store Connect / Google Play before any release
(see "Updating the bundle identifier").

---

## 1. How the build works

| Command | Output | Used by |
| --- | --- | --- |
| `bun run build` | `dist/client` + `dist/server` (SSR, Cloudflare) | web / Lovable deploy |
| `bun run build:native` | `dist/native` (static `index.html` + assets) | Capacitor |

`bun run build:native` runs `vite build` with `NOVA_NATIVE=1`. That flag makes
`vite.config.ts` skip the server (nitro) output and enable TanStack Start's SPA
shell, then `scripts/build-native.mjs` copies `dist/client` to `dist/native` and
renames `_shell.html` to `index.html`. Routing inside the WebView is fully
client-side, so a single shell is enough.

`capacitor.config.ts` points `webDir` at `dist/native`.

---

## 2. Install dependencies

Already in `devDependencies`: `@capacitor/core`, `@capacitor/cli`,
`@capacitor/ios`, `@capacitor/android`.

```bash
bun install          # or npm install
```

Additional tooling, per platform:

- **iOS**: macOS, Xcode 15+, Xcode command line tools, CocoaPods (`sudo gem install cocoapods`)
- **Android**: Android Studio (Hedgehog+) with the Android SDK and a JDK 17

---

## 3. Build + sync

```bash
bun run build:native   # produces dist/native
bunx cap sync          # copies web assets + updates native projects
# shortcut for both:
bun run cap:sync
```

Run `cap sync` after **every** web change and after adding any plugin.

---

## 4. Create the native projects (once)

```bash
bunx cap add ios       # macOS only
bunx cap add android
```

This creates `ios/` and `android/` directories in the repo root. Commit them —
they hold native config, icons and permission declarations.

---

## 5. Open and run

### iOS (Xcode)

```bash
bunx cap open ios      # or: bun run cap:ios
```

1. In Xcode select the `App` target → **Signing & Capabilities**.
2. Choose your Apple Developer team and set the bundle identifier.
3. Connect an iPhone over USB, trust the computer, and select it as the run destination.
4. Press ▶. On first launch: iPhone → Settings → General → VPN & Device Management → trust the developer certificate.

### Android (Android Studio)

```bash
bunx cap open android  # or: bun run cap:android
```

1. Let Gradle sync finish.
2. Enable Developer options + USB debugging on the phone and connect it.
3. Select the device and press ▶.

---

## 6. Updating the app version

- **Web/product version**: `package.json` `version` and the `APP_VERSION` shown in `/diagnostics`.
- **iOS**: Xcode → `App` target → General → *Version* (marketing) and *Build* (increment for every upload), or edit `ios/App/App/Info.plist` (`CFBundleShortVersionString`, `CFBundleVersion`).
- **Android**: `android/app/build.gradle` → `versionName` (marketing) and `versionCode` (integer, must increase for every upload).

Keep the three in sync when you ship.

## 7. Updating the bundle identifier

1. Edit `appId` in `capacitor.config.ts`.
2. Run `bunx cap sync`.
3. **iOS**: Xcode → target → Signing & Capabilities → Bundle Identifier.
4. **Android**: `android/app/build.gradle` → `namespace` and `applicationId`, plus the package folder under `android/app/src/main/java/...`.

Changing the id after publishing creates a *new* app listing — do it before the first release.

---

## 8. What is NOT implemented natively

These are **not** available today and must not be advertised as working:

- Face ID / Touch ID (settings toggle stores a preference only)
- PIN lock enforcement (no lock screen gate on resume)
- Native push notifications (Notification Center is in-app only)
- Native camera capture and receipt OCR (`/scan` is a simulation)
- Secure keychain / encrypted storage (data is in WebView `localStorage`)
- App badge counts, haptics, native share sheet

See `src/lib/native.ts` for the capability matrix the UI reads, surfaced in `/diagnostics`.

---

## 9. Native integration checklist (future plugins)

| Capability | Plugin | Native work required |
| --- | --- | --- |
| Biometrics (Face ID / Touch ID) | `capacitor-native-biometric` | `NSFaceIDUsageDescription`; lock gate on app resume; fallback to PIN |
| Push notifications | `@capacitor/push-notifications` | APNs key + FCM config, `POST_NOTIFICATIONS` (Android 13+), token storage, server sender |
| Local notifications | `@capacitor/local-notifications` | Permission prompt; schedule from subscriptions/recurring engine |
| Camera / photo library | `@capacitor/camera` | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `android.permission.CAMERA`, `READ_MEDIA_IMAGES` |
| OCR | ML Kit (Android) / Vision (iOS) via custom plugin | Replace the simulated pipeline in `/scan` |
| Secure storage | `capacitor-secure-storage-plugin` or Keychain/Keystore plugin | Move PIN + any tokens out of `localStorage` |
| Share / export | `@capacitor/share` + `@capacitor/filesystem` | Write JSON/CSV to a temp file, then open the share sheet |
| App badge | `@capacitor/app` + badge plugin | Drive from unread notification count |
| Deep links | `@capacitor/app` `appUrlOpen` | Universal Links (`apple-app-site-association`) / Android App Links; OAuth redirect for Google sign-in |
| Haptics | `@capacitor/haptics` | Light impact on tab switch, success on transaction save, warning on destructive confirm |
| Status bar / splash | `@capacitor/status-bar`, `@capacitor/splash-screen` | Dark style, `#0b0f14` background, icons from `public/icons/icon-1024.png` |

Every plugin addition: `bun add <plugin>` → `bunx cap sync` → declare permissions → **guard the call with `isNativeShell()` from `src/lib/native.ts`** so the web build keeps working.

---

## 10. Auth note

Supabase sign-in runs inside the WebView. `androidScheme: "https"` keeps the
session on one origin. For Google OAuth, register the native redirect
(`<bundle-id>://auth` plus the hosted callback) before enabling it in the app.
