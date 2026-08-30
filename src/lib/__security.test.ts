import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  clearPin,
  loadConfig,
  saveConfig,
  setBiometricEnabled,
  setDelay,
  setPin,
  unlockWithBiometric,
  unlockWithPin,
  type LockConfig,
} from "./lock-core";
import { createMemorySecureStore, type SecureStore } from "./secure-store";
import {
  __setBiometricProviderForTests,
  type BiometricProvider,
  type BiometricResult,
  type BiometricStatus,
} from "./biometrics";

function fakeBio(status: BiometricStatus, result: BiometricResult): BiometricProvider {
  return {
    async status() {
      return status;
    },
    async authenticate() {
      return result;
    },
  };
}

const FACE_ID: BiometricStatus = { available: true, kind: "faceId" };
const TOUCH_ID: BiometricStatus = { available: true, kind: "touchId" };
const WEB: BiometricStatus = { available: false, kind: "none", reason: "web" };
const UNSUPPORTED: BiometricStatus = { available: false, kind: "none", reason: "unsupported" };

let store: SecureStore;

beforeEach(() => {
  store = createMemorySecureStore();
  __setBiometricProviderForTests(fakeBio(FACE_ID, "success"));
});
afterEach(() => {
  __setBiometricProviderForTests(null);
});

async function withPin(pin = "123456"): Promise<LockConfig> {
  const res = await setPin(DEFAULT_CONFIG, pin, undefined, store);
  return res.config;
}

describe("PIN lifecycle", () => {
  it("creates a PIN and stores only a hash", async () => {
    const cfg = await withPin("135790");
    expect(cfg.pin).toBeTruthy();
    const raw = (await store.get("nova.lock.v1")) ?? "";
    expect(raw).not.toContain("135790");
    expect(raw.length).toBeGreaterThan(0);
  });

  it("rejects PINs that are not 6 digits", async () => {
    const res = await setPin(DEFAULT_CONFIG, "12345", undefined, store);
    expect(res.error).toBe("invalid");
    expect(res.config.pin).toBeNull();
  });

  it("confirms the correct PIN and rejects a wrong one", async () => {
    const cfg = await withPin("246810");
    await expect(unlockWithPin(cfg, "246810")).resolves.toBe(true);
    await expect(unlockWithPin(cfg, "246811")).resolves.toBe(false);
  });

  it("requires the current PIN to change it", async () => {
    const cfg = await withPin("111111");
    const bad = await setPin(cfg, "222222", "999999", store);
    expect(bad.error).toBe("wrong-current");
    await expect(unlockWithPin(bad.config, "111111")).resolves.toBe(true);

    const ok = await setPin(cfg, "222222", "111111", store);
    expect(ok.error).toBeUndefined();
    await expect(unlockWithPin(ok.config, "222222")).resolves.toBe(true);
    await expect(unlockWithPin(ok.config, "111111")).resolves.toBe(false);
  });

  it("requires authentication before disabling the lock", async () => {
    const cfg = await withPin("333333");
    const denied = await clearPin(cfg, { pin: "000000" }, store);
    expect(denied.error).toBe("wrong-current");
    expect(denied.config.pin).toBeTruthy();

    const done = await clearPin(cfg, { pin: "333333" }, store);
    expect(done.error).toBeUndefined();
    expect(done.config.pin).toBeNull();
    expect(done.config.biometric).toBe(false);
  });

  it("allows biometric proof to disable the lock only when biometrics are on", async () => {
    const cfg = await withPin("444444");
    const noBio = await clearPin(cfg, { biometric: true }, store);
    expect(noBio.error).toBe("wrong-current");

    const enabled = (await setBiometricEnabled(cfg, true, store)).config;
    const done = await clearPin(enabled, { biometric: true }, store);
    expect(done.config.pin).toBeNull();
  });
});

describe("biometrics", () => {
  it("cannot be enabled without a PIN", async () => {
    const res = await setBiometricEnabled(DEFAULT_CONFIG, true, store);
    expect(res.error).toBe("no-pin");
    expect(res.config.biometric).toBe(false);
  });

  it("enables only after a real successful authentication", async () => {
    const cfg = await withPin();
    const res = await setBiometricEnabled(cfg, true, store);
    expect(res.error).toBeUndefined();
    expect(res.config.biometric).toBe(true);
  });

  it("does not enable when authentication fails", async () => {
    __setBiometricProviderForTests(fakeBio(TOUCH_ID, "failed"));
    const cfg = await withPin();
    const res = await setBiometricEnabled(cfg, true, store);
    expect(res.error).toBe("failed");
    expect(res.config.biometric).toBe(false);
  });

  it("does not enable when the user cancels", async () => {
    __setBiometricProviderForTests(fakeBio(FACE_ID, "cancelled"));
    const cfg = await withPin();
    const res = await setBiometricEnabled(cfg, true, store);
    expect(res.error).toBe("cancelled");
    expect(res.config.biometric).toBe(false);
  });

  it("reports unavailable on unsupported devices", async () => {
    __setBiometricProviderForTests(fakeBio(UNSUPPORTED, "unavailable"));
    const cfg = await withPin();
    const res = await setBiometricEnabled(cfg, true, store);
    expect(res.error).toBe("unavailable");
  });

  it("falls back to PIN on the web where biometrics are unavailable", async () => {
    __setBiometricProviderForTests(fakeBio(WEB, "unavailable"));
    const cfg = await withPin("555555");
    const res = await setBiometricEnabled(cfg, true, store);
    expect(res.error).toBe("unavailable");
    await expect(unlockWithBiometric(res.config, "reason")).resolves.toBe("unavailable");
    await expect(unlockWithPin(res.config, "555555")).resolves.toBe(true);
  });

  it("unlocks with biometrics only when enabled, and never simulates success", async () => {
    const cfg = await withPin();
    await expect(unlockWithBiometric(cfg, "r")).resolves.toBe("unavailable");
    const on = (await setBiometricEnabled(cfg, true, store)).config;
    await expect(unlockWithBiometric(on, "r")).resolves.toBe("success");

    __setBiometricProviderForTests(fakeBio(FACE_ID, "failed"));
    await expect(unlockWithBiometric(on, "r")).resolves.toBe("failed");
  });

  it("turns biometrics off without any authentication prompt", async () => {
    const cfg = await withPin();
    const on = (await setBiometricEnabled(cfg, true, store)).config;
    __setBiometricProviderForTests(fakeBio(FACE_ID, "failed"));
    const off = await setBiometricEnabled(on, false, store);
    expect(off.error).toBeUndefined();
    expect(off.config.biometric).toBe(false);
  });
});

describe("config persistence", () => {
  it("round-trips through the secure store", async () => {
    const cfg = await withPin("777777");
    const withDelay = await setDelay(cfg, "m15", store);
    const loaded = await loadConfig(store);
    expect(loaded.delay).toBe("m15");
    expect(loaded.pin?.hash).toBe(withDelay.pin?.hash);
    await expect(unlockWithPin(loaded, "777777")).resolves.toBe(true);
  });

  it("treats a corrupted config as no lock instead of locking the user out", async () => {
    await store.set("nova.lock.v1", "{not json");
    const loaded = await loadConfig(store);
    expect(loaded.pin).toBeNull();
    expect(loaded.delay).toBe("m5");
  });

  it("normalises unknown delays on save", async () => {
    const saved = await saveConfig(
      { ...DEFAULT_CONFIG, delay: "weird" as never },
      store,
    );
    expect(saved.delay).toBe("weird");
    const loaded = await loadConfig(store);
    expect(loaded.delay).toBe("m5");
  });
});
