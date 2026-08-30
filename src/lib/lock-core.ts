/**
 * Headless lock core.
 *
 * All security state transitions (create / change / disable PIN, enable
 * biometrics, unlock) live here so they can be tested without React and
 * without native APIs. The React layer (`lock.tsx`) only owns UI state.
 *
 * Only lock credentials go through the secure store — never financial data.
 */
import { getSecureStore, type SecureStore } from "@/lib/secure-store";
import { createPinCredential, isValidPin, verifyPin, type PinCredential } from "@/lib/pin";
import {
  authenticateBiometric,
  getBiometricStatus,
  type BiometricResult,
} from "@/lib/biometrics";
import { normalizeDelay, type AutoLockDelay } from "@/lib/lock-policy";

export const CONFIG_KEY = "nova.lock.v1";
/** Non-sensitive hint so the very first paint can lock without a flash. */
export const HINT_KEY = "nova.lock.enabled";

export type LockConfig = {
  pin: PinCredential | null;
  biometric: boolean;
  delay: AutoLockDelay;
};

export const DEFAULT_CONFIG: LockConfig = { pin: null, biometric: false, delay: "m5" };

export type SetPinError = "invalid" | "wrong-current";
export type BiometricEnableError = "no-pin" | "unavailable" | BiometricResult;

function writeHint(enabled: boolean) {
  try {
    window.localStorage.setItem(HINT_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export async function loadConfig(store?: SecureStore): Promise<LockConfig> {
  const s = store ?? (await getSecureStore());
  try {
    const raw = await s.get(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LockConfig>;
    return {
      pin: parsed.pin ?? null,
      biometric: Boolean(parsed.biometric),
      delay: normalizeDelay(parsed.delay),
    };
  } catch {
    // Corrupted config → treat as "no lock" rather than locking the user out.
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(next: LockConfig, store?: SecureStore): Promise<LockConfig> {
  const s = store ?? (await getSecureStore());
  await s.set(CONFIG_KEY, JSON.stringify(next));
  writeHint(Boolean(next.pin));
  return next;
}

/** Create or change the PIN. Changing requires the current PIN. */
export async function setPin(
  config: LockConfig,
  next: string,
  current: string | undefined,
  store?: SecureStore,
): Promise<{ config: LockConfig; error?: SetPinError }> {
  if (!isValidPin(next)) return { config, error: "invalid" };
  if (config.pin && !(await verifyPin(current ?? "", config.pin))) {
    return { config, error: "wrong-current" };
  }
  const cred = await createPinCredential(next);
  return { config: await saveConfig({ ...config, pin: cred }, store) };
}

/**
 * Disable the lock. Requires proof of ownership: the current PIN, or a
 * successful biometric authentication when biometrics are enabled.
 */
export async function clearPin(
  config: LockConfig,
  proof: { pin?: string; biometric?: boolean },
  store?: SecureStore,
): Promise<{ config: LockConfig; error?: "wrong-current" }> {
  if (!config.pin) return { config };
  const ok = proof.biometric
    ? config.biometric && (await authenticateBiometric("Disable NOVA app lock")) === "success"
    : await verifyPin(proof.pin ?? "", config.pin);
  if (!ok) return { config, error: "wrong-current" };
  return { config: await saveConfig({ ...config, pin: null, biometric: false }, store) };
}

/** Enabling biometrics performs a real authentication first; never simulated. */
export async function setBiometricEnabled(
  config: LockConfig,
  on: boolean,
  store?: SecureStore,
): Promise<{ config: LockConfig; error?: BiometricEnableError }> {
  if (!on) return { config: await saveConfig({ ...config, biometric: false }, store) };
  // Biometrics may never be the only way in.
  if (!config.pin) return { config, error: "no-pin" };
  const st = await getBiometricStatus();
  if (!st.available) return { config, error: "unavailable" };
  const res = await authenticateBiometric("Enable biometric unlock for NOVA");
  if (res !== "success") return { config, error: res };
  return { config: await saveConfig({ ...config, biometric: true }, store) };
}

export async function setDelay(
  config: LockConfig,
  delay: AutoLockDelay,
  store?: SecureStore,
): Promise<LockConfig> {
  return saveConfig({ ...config, delay: normalizeDelay(delay) }, store);
}

export async function unlockWithPin(config: LockConfig, pin: string): Promise<boolean> {
  return verifyPin(pin, config.pin);
}

/** Biometric unlock. Falls back to PIN by returning a non-success result. */
export async function unlockWithBiometric(
  config: LockConfig,
  reason: string,
): Promise<BiometricResult> {
  if (!config.biometric || !config.pin) return "unavailable";
  return authenticateBiometric(reason);
}
