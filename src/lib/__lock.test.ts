import { describe, expect, it } from "vitest";
import {
  createPinCredential,
  hashPin,
  isValidPin,
  verifyPin,
  PIN_ITERATIONS,
} from "./pin";
import {
  delayMs,
  normalizeDelay,
  shouldLockOnColdLaunch,
  shouldLockOnInactivity,
  shouldLockOnResume,
} from "./lock-policy";

describe("pin credentials", () => {
  it("accepts only 6 digits", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a456")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("never stores the PIN in cleartext", async () => {
    const cred = await createPinCredential("135790");
    const json = JSON.stringify(cred);
    expect(json).not.toContain("135790");
    expect(cred.iterations).toBe(PIN_ITERATIONS);
    expect(cred.salt.length).toBeGreaterThan(16);
  });

  it("salts each credential so identical PINs differ", async () => {
    const a = await createPinCredential("111111");
    const b = await createPinCredential("111111");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("verifies the correct PIN and rejects wrong ones", async () => {
    const cred = await createPinCredential("246810");
    await expect(verifyPin("246810", cred)).resolves.toBe(true);
    await expect(verifyPin("246811", cred)).resolves.toBe(false);
    await expect(verifyPin("", cred)).resolves.toBe(false);
  });

  it("rejects verification when no credential exists", async () => {
    await expect(verifyPin("123456", null)).resolves.toBe(false);
  });

  it("is deterministic for a fixed salt", async () => {
    const cred = await createPinCredential("000000");
    const again = await hashPin("000000", cred.salt, cred.iterations);
    expect(again).toBe(cred.hash);
  });
});

describe("auto-lock policy", () => {
  const now = 1_000_000;

  it("maps delays to milliseconds", () => {
    expect(delayMs("immediate")).toBe(0);
    expect(delayMs("m1")).toBe(60_000);
    expect(delayMs("m15")).toBe(900_000);
    expect(delayMs("never")).toBe(Number.POSITIVE_INFINITY);
  });

  it("normalises unknown stored values", () => {
    expect(normalizeDelay("m15")).toBe("m15");
    expect(normalizeDelay(undefined)).toBe("m5");
    expect(normalizeDelay(15)).toBe("m5");
  });

  it("locks immediately on resume when set to immediate", () => {
    expect(
      shouldLockOnResume({ lockEnabled: true, delay: "immediate", backgroundedAt: now, now }),
    ).toBe(true);
  });

  it("waits for the delay before locking on resume", () => {
    expect(
      shouldLockOnResume({ lockEnabled: true, delay: "m5", backgroundedAt: now - 60_000, now }),
    ).toBe(false);
    expect(
      shouldLockOnResume({ lockEnabled: true, delay: "m5", backgroundedAt: now - 300_000, now }),
    ).toBe(true);
  });

  it("never locks when lock is off or delay is never", () => {
    expect(
      shouldLockOnResume({ lockEnabled: false, delay: "immediate", backgroundedAt: 0, now }),
    ).toBe(false);
    expect(
      shouldLockOnResume({ lockEnabled: true, delay: "never", backgroundedAt: 0, now }),
    ).toBe(false);
  });

  it("ignores resume checks when the app was never backgrounded", () => {
    expect(
      shouldLockOnResume({ lockEnabled: true, delay: "m1", backgroundedAt: null, now }),
    ).toBe(false);
  });

  it("locks on foreground inactivity past the delay", () => {
    expect(
      shouldLockOnInactivity({ lockEnabled: true, delay: "m1", lastActivityAt: now - 61_000, now }),
    ).toBe(true);
    expect(
      shouldLockOnInactivity({ lockEnabled: true, delay: "m1", lastActivityAt: now - 10_000, now }),
    ).toBe(false);
  });

  it("does not lock an actively used app when set to immediate", () => {
    expect(
      shouldLockOnInactivity({
        lockEnabled: true,
        delay: "immediate",
        lastActivityAt: now,
        now,
      }),
    ).toBe(false);
  });

  it("locks on cold launch whenever a PIN exists", () => {
    expect(shouldLockOnColdLaunch(true)).toBe(true);
    expect(shouldLockOnColdLaunch(false)).toBe(false);
  });
});
