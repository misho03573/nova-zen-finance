/**
 * Secure storage abstraction for lock credentials only.
 *
 * Native (Capacitor): iOS Keychain / Android Keystore via
 * `@aparajita/capacitor-secure-storage`.
 * Web: localStorage under a dedicated `nova.secure.*` namespace. The PIN is
 * never stored in plaintext anywhere — only a PBKDF2 hash + salt (see pin.ts).
 *
 * Financial data never goes through this module.
 */
import { isNativeShell } from "@/lib/native";

export type SecureBackend = "keychain" | "local" | "memory";

export type SecureStore = {
  backend: SecureBackend;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const WEB_PREFIX = "nova.secure.";

const memoryMap = new Map<string, string>();

const memoryStore: SecureStore = {
  backend: "memory",
  async get(k) {
    return memoryMap.get(k) ?? null;
  },
  async set(k, v) {
    memoryMap.set(k, v);
  },
  async remove(k) {
    memoryMap.delete(k);
  },
};

const localStore: SecureStore = {
  backend: "local",
  async get(k) {
    try {
      return window.localStorage.getItem(WEB_PREFIX + k);
    } catch {
      return null;
    }
  },
  async set(k, v) {
    try {
      window.localStorage.setItem(WEB_PREFIX + k, v);
    } catch {
      /* ignore */
    }
  },
  async remove(k) {
    try {
      window.localStorage.removeItem(WEB_PREFIX + k);
    } catch {
      /* ignore */
    }
  },
};

let cached: SecureStore | null = null;
let override: SecureStore | null = null;

/** Test seam — lets the suite drive an in-memory backend. */
export function __setSecureStoreForTests(store: SecureStore | null) {
  override = store;
  cached = null;
}

export function createMemorySecureStore(): SecureStore {
  const map = new Map<string, string>();
  return {
    backend: "memory",
    async get(k) {
      return map.get(k) ?? null;
    },
    async set(k, v) {
      map.set(k, v);
    },
    async remove(k) {
      map.delete(k);
    },
  };
}

export async function getSecureStore(): Promise<SecureStore> {
  if (override) return override;
  if (cached) return cached;
  if (typeof window === "undefined") return memoryStore;
  if (!isNativeShell()) {
    cached = localStore;
    return cached;
  }
  try {
    const mod = await import("@aparajita/capacitor-secure-storage");
    const ss = mod.SecureStorage;
    cached = {
      backend: "keychain",
      async get(k) {
        const v = await ss.get(k);
        return typeof v === "string" ? v : null;
      },
      async set(k, v) {
        await ss.set(k, v);
      },
      async remove(k) {
        await ss.remove(k);
      },
    };
  } catch {
    cached = localStore;
  }
  return cached;
}
