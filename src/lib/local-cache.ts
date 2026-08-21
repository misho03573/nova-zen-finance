/**
 * Local cache hygiene for NOVA.
 *
 * Financial state is cached per user under `nova.store.v3.<userId>` (guests
 * share `nova.store.v3`). This module owns the cleanup contract so sign-out,
 * account switching and "reset all data" all wipe exactly the same keys.
 *
 * Deliberately preserved: theme, language, currency and the onboarding flag.
 * They hold no financial or identifying data and keep the app usable for the
 * next person on the device.
 */
export const GUEST_STORE_KEY = "nova.store.v3";

export function storeKeyFor(userId: string | null) {
  return userId ? `${GUEST_STORE_KEY}.${userId}` : GUEST_STORE_KEY;
}

/** Every sensitive key NOVA writes for a given user (plus the guest slot). */
export function sensitiveKeys(userId?: string | null): string[] {
  return [
    GUEST_STORE_KEY,
    "nova.store.v2",
    "nova.store.v1",
    "nova.txfilters.v1.guest",
    ...(userId ? [storeKeyFor(userId), `nova.txfilters.v1.${userId}`] : []),
  ];
}

/** Removes cached financial data for a user from this device. */
export function clearLocalNovaData(userId?: string | null) {
  if (typeof window === "undefined") return;
  for (const k of sensitiveKeys(userId)) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** True when a localStorage key holds financial data (used by diagnostics). */
export function isSensitiveKey(key: string): boolean {
  return key.startsWith("nova.store.") || key.startsWith("nova.txfilters.");
}

/**
 * Diagnostics-safe key label: never expose a raw user id in a copied report.
 */
export function redactStorageKey(key: string): string {
  return key.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "<user>",
  );
}
