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
  getBiometricStatus,
  type BiometricResult,
  type BiometricStatus,
} from "@/lib/biometrics";
import * as core from "@/lib/lock-core";
import type { LockConfig } from "@/lib/lock-core";
import {
  normalizeDelay,
  shouldLockOnInactivity,
  shouldLockOnResume,
  type AutoLockDelay,
} from "@/lib/lock-policy";
import { isNativeShell } from "@/lib/native";

export type { LockConfig } from "@/lib/lock-core";

const DEFAULT_CONFIG = core.DEFAULT_CONFIG;

type LockCtx = {
  ready: boolean;
  locked: boolean;
  hasPin: boolean;
  biometricEnabled: boolean;
  biometricStatus: BiometricStatus;
  delay: AutoLockDelay;
  backend: string;
  setPin(next: string, current?: string): Promise<{ error?: core.SetPinError }>;
  clearPin(proof: { pin?: string; biometric?: boolean }): Promise<{ error?: "wrong-current" }>;
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
  const [locked, setLocked] = useState(() => core.readHint());

  const configRef = useRef(config);
  configRef.current = config;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const backgroundedAt = useRef<number | null>(null);
  const lastActivity = useRef(Date.now());

  const persist = useCallback((next: LockConfig) => {
    setConfig(next);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const store = await getSecureStore();
      const loaded = await core.loadConfig(store);
      if (!alive) return;
      setBackend(store.backend);
      setConfig(loaded);
      setLocked(Boolean(loaded.pin));
      await core.saveConfig(loaded, store);
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
        const res = await core.setPin(config, next, current);
        if (res.error) return { error: res.error };
        persist(res.config);
        setLocked(false);
        return {};
      },
      async clearPin(proof) {
        const res = await core.clearPin(config, proof);
        if (res.error) return { error: res.error };
        persist(res.config);
        setLocked(false);
        return {};
      },
      async setBiometricEnabled(on) {
        const st = await getBiometricStatus();
        setBiometricStatus(st);
        const res = await core.setBiometricEnabled(config, on);
        if (res.error) return { error: res.error };
        persist(res.config);
        return {};
      },
      async setDelay(d) {
        persist(await core.setDelay(config, d));
      },
      async unlockWithPin(pin) {
        const ok = await core.unlockWithPin(config, pin);
        if (ok) {
          lastActivity.current = Date.now();
          setLocked(false);
        }
        return ok;
      },
      async unlockWithBiometric(reason) {
        const res = await core.unlockWithBiometric(config, reason);
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
