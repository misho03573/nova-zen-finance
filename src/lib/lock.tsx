/**
 * App lock: PIN + native biometrics + lifecycle-driven auto-lock.
 *
 * Lock configuration lives ONLY in secure storage (Keychain on iOS,
 * namespaced localStorage on web). It never enters the NOVA store, so
 * locking/unlocking cannot trigger cloud writes or overwrite remote state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSecureStore } from "@/lib/secure-store";
import {
  createPinCredential,
  verifyPin,
  isValidPin,
  type PinCredential,
} from "@/lib/pin";
import {
  authenticateBiometric,
  getBiometricStatus,
  type BiometricResult,
  type BiometricStatus,
} from "@/lib/biometrics";
import {
  normalizeDelay,
  shouldLockOnInactivity,
  shouldLockOnResume,
  type AutoLockDelay,
} from "@/lib/lock-policy";
import { isNativeShell } from "@/lib/native";

const CONFIG_KEY = "nova.lock.v1";
/** Non-sensitive hint so the very first paint can lock without a flash. */
const HINT_KEY = "nova.lock.enabled";

export type LockConfig = {
  pin: PinCredential | null;
  biometric: boolean;
  delay: AutoLockDelay;
};

const DEFAULT_CONFIG: LockConfig = { pin: null, biometric: false, delay: "m5" };

type LockCtx = {
  ready: boolean;
  locked: boolean;
  hasPin: boolean;
  biometricEnabled: boolean;
  biometricStatus: BiometricStatus;
  delay: AutoLockDelay;
  backend: string;
  setPin(next: string, current?: string): Promise<{ error?: "invalid" | "wrong-current" }>;
  clearPin(): Promise<void>;
  setBiometricEnabled(on: boolean): Promise<{ error?: "no-pin" | "unavailable" | BiometricResult }>;
  setDelay(d: AutoLockDelay): Promise<void>;
  unlockWithPin(pin: string): Promise<boolean>;
  unlockWithBiometric(reason: string): Promise<BiometricResult>;
  lockNow(): void;
};

const Ctx = createContext<LockCtx | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LockConfig>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState("local");
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
    available: false,
    kind: "none",
    reason: isNativeShell() ? "unsupported" : "web",
  });
  // Cold launch: lock immediately if the hint says a PIN exists.
  const [locked, setLocked] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  const configRef = useRef(config);
  configRef.current = config;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const backgroundedAt = useRef<number | null>(null);
  const lastActivity = useRef(Date.now());

  const persist = useCallback(async (next: LockConfig) => {
    setConfig(next);
    const store = await getSecureStore();
    await store.set(CONFIG_KEY, JSON.stringify(next));
    try {
      window.localStorage.setItem(HINT_KEY, next.pin ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const store = await getSecureStore();
      let loaded = DEFAULT_CONFIG;
      try {
        const raw = await store.get(CONFIG_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<LockConfig>;
          loaded = {
            pin: parsed.pin ?? null,
            biometric: Boolean(parsed.biometric),
            delay: normalizeDelay(parsed.delay),
          };
        }
      } catch {
        /* corrupted config → treat as no lock */
      }
      if (!alive) return;
      setBackend(store.backend);
      setConfig(loaded);
      setLocked(Boolean(loaded.pin));
      try {
        window.localStorage.setItem(HINT_KEY, loaded.pin ? "1" : "0");
      } catch {
        /* ignore */
      }
      setReady(true);
      const st = await getBiometricStatus();
      if (alive) setBiometricStatus(st);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Lifecycle: background / foreground / resume, native + web.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBackground = () => {
      backgroundedAt.current = Date.now();
    };
    const onForeground = () => {
      const cfg = configRef.current;
      if (
        shouldLockOnResume({
          lockEnabled: Boolean(cfg.pin),
          delay: cfg.delay,
          backgroundedAt: backgroundedAt.current,
          now: Date.now(),
        })
      ) {
        setLocked(true);
      }
      backgroundedAt.current = null;
      lastActivity.current = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onBackground();
      else onForeground();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let removeNative: (() => void) | undefined;
    if (isNativeShell()) {
      import("@capacitor/app")
        .then(async ({ App }) => {
          const handle = await App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) onForeground();
            else onBackground();
          });
          removeNative = () => {
            void handle.remove();
          };
        })
        .catch(() => undefined);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeNative?.();
    };
  }, []);

  // Foreground inactivity. Typing/scrolling/tapping all count as activity.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
      "input" as keyof WindowEventMap,
    ];
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const id = window.setInterval(() => {
      const cfg = configRef.current;
      if (lockedRef.current) return;
      if (
        shouldLockOnInactivity({
          lockEnabled: Boolean(cfg.pin),
          delay: cfg.delay,
          lastActivityAt: lastActivity.current,
          now: Date.now(),
        })
      ) {
        setLocked(true);
      }
    }, 15_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(id);
    };
  }, []);

  const value = useMemo<LockCtx>(
    () => ({
      ready,
      locked,
      hasPin: Boolean(config.pin),
      biometricEnabled: config.biometric && Boolean(config.pin),
      biometricStatus,
      delay: config.delay,
      backend,
      async setPin(next, current) {
        if (!isValidPin(next)) return { error: "invalid" as const };
        if (config.pin && !(await verifyPin(current ?? "", config.pin))) {
          return { error: "wrong-current" as const };
        }
        const cred = await createPinCredential(next);
        await persist({ ...config, pin: cred });
        setLocked(false);
        return {};
      },
      async clearPin() {
        await persist({ ...config, pin: null, biometric: false });
        setLocked(false);
      },
      async setBiometricEnabled(on) {
        if (!on) {
          await persist({ ...config, biometric: false });
          return {};
        }
        // Safety: biometrics may never be the only way in.
        if (!config.pin) return { error: "no-pin" as const };
        const st = await getBiometricStatus();
        setBiometricStatus(st);
        if (!st.available) return { error: "unavailable" as const };
        const res = await authenticateBiometric("Enable biometric unlock for NOVA");
        if (res !== "success") return { error: res };
        await persist({ ...config, biometric: true });
        return {};
      },
      async setDelay(d) {
        await persist({ ...config, delay: d });
      },
      async unlockWithPin(pin) {
        const ok = await verifyPin(pin, config.pin);
        if (ok) {
          lastActivity.current = Date.now();
          setLocked(false);
        }
        return ok;
      },
      async unlockWithBiometric(reason) {
        if (!config.biometric || !config.pin) return "unavailable";
        const res = await authenticateBiometric(reason);
        if (res === "success") {
          lastActivity.current = Date.now();
          setLocked(false);
        }
        return res;
      },
      lockNow() {
        if (configRef.current.pin) setLocked(true);
      },
    }),
    [ready, locked, config, biometricStatus, backend, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLock() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLock must be used inside LockProvider");
  return c;
}
