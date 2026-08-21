import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the NOVA native shell.
 *
 * `appId` is a PLACEHOLDER — replace `app.nova.finance` with the real reverse-DNS
 * bundle identifier registered in App Store Connect / Google Play before release.
 *
 * `webDir` points at the static bundle produced by `bun run build:native`
 * (see scripts/build-native.mjs). The regular web build is unaffected.
 */
const config: CapacitorConfig = {
  appId: "app.nova.finance",
  appName: "NOVA",
  webDir: "dist/native",
  backgroundColor: "#0b0f14",
  android: {
    // Keeps browser storage (Supabase auth session) on a single https origin.
    androidScheme: "https",
    backgroundColor: "#0b0f14",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0b0f14",
  },
};

export default config;
