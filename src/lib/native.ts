/**
 * Platform capability abstraction (Phase 8 — mobile / Capacitor readiness).
 *
 * NOVA currently runs as a mobile-first web app. This module is the single
 * place that answers "can this device actually do X?" so that:
 *   - the UI never advertises a capability it does not have
 *   - a future Capacitor wrapper can implement these adapters natively
 *     without touching feature code.
 *
 * Nothing here fakes a native API. Anything that requires a native plugin
 * reports `status: "native-required"` and the UI must label it as a preview.
 */

export type CapabilityStatus =
  /** Works unchanged in the browser and in a Capacitor WebView. */
  | "web"
  /** Works in the browser today, needs a plugin for the best native behaviour. */
  | "web-degraded"
  /** Not available at all until a Capacitor plugin + native permission exist. */
  | "native-required";

export type CapabilityId =
  | "storage"
  | "fileImport"
  | "fileExport"
  | "camera"
  | "photoLibrary"
  | "ocr"
  | "notifications"
  | "biometrics"
  | "clipboard"
  | "share";

export type Capability = {
  id: CapabilityId;
  status: CapabilityStatus;
  /** Capacitor plugin that would implement this natively. */
  plugin?: string;
  /** Native permission the wrapper must declare. */
  permission?: string;
};

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  storage: { id: "storage", status: "web", plugin: "@capacitor/preferences" },
  fileImport: { id: "fileImport", status: "web", plugin: "@capacitor/filesystem" },
  fileExport: {
    id: "fileExport",
    status: "web-degraded",
    plugin: "@capacitor/filesystem + @capacitor/share",
    permission: "iOS: none (share sheet) · Android: none on API 29+",
  },
  camera: {
    id: "camera",
    status: "native-required",
    plugin: "@capacitor/camera",
    permission: "NSCameraUsageDescription / android.permission.CAMERA",
  },
  photoLibrary: {
    id: "photoLibrary",
    status: "native-required",
    plugin: "@capacitor/camera",
    permission: "NSPhotoLibraryUsageDescription / READ_MEDIA_IMAGES",
  },
  ocr: { id: "ocr", status: "native-required", plugin: "ML Kit / Vision (custom plugin)" },
  notifications: {
    id: "notifications",
    status: "native-required",
    plugin: "@capacitor/local-notifications, @capacitor/push-notifications",
    permission: "iOS: UNUserNotificationCenter · Android 13+: POST_NOTIFICATIONS",
  },
  biometrics: {
    id: "biometrics",
    status: "native-required",
    plugin: "capacitor-native-biometric",
    permission: "NSFaceIDUsageDescription / USE_BIOMETRIC",
  },
  clipboard: { id: "clipboard", status: "web", plugin: "@capacitor/clipboard" },
  share: { id: "share", status: "web-degraded", plugin: "@capacitor/share" },
};

/** True when running inside a Capacitor native shell. Always false on the web. */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor injects this global; we only read it, never require the package.
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** True when the app is launched from the home screen (installed PWA). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || window.matchMedia("(display-mode: standalone)").matches;
}

/** Resolve a capability, upgrading statuses when a native shell is present. */
export function capability(id: CapabilityId): Capability {
  const base = CAPABILITIES[id];
  if (!isNativeShell()) return base;
  return { ...base, status: base.status === "native-required" ? "web-degraded" : "web" };
}
