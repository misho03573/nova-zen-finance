/**
 * Pure auto-lock policy. No timers, no DOM — so it is fully testable.
 */
export type AutoLockDelay = "immediate" | "m1" | "m5" | "m15" | "never";

export const AUTO_LOCK_DELAYS: AutoLockDelay[] = ["immediate", "m1", "m5", "m15", "never"];

export function delayMs(delay: AutoLockDelay): number {
  switch (delay) {
    case "immediate":
      return 0;
    case "m1":
      return 60_000;
    case "m5":
      return 5 * 60_000;
    case "m15":
      return 15 * 60_000;
    case "never":
      return Number.POSITIVE_INFINITY;
  }
}

export function normalizeDelay(value: unknown): AutoLockDelay {
  return AUTO_LOCK_DELAYS.includes(value as AutoLockDelay) ? (value as AutoLockDelay) : "m5";
}

/** Lock when the app returns to the foreground after being away long enough. */
export function shouldLockOnResume(args: {
  lockEnabled: boolean;
  delay: AutoLockDelay;
  backgroundedAt: number | null;
  now: number;
}): boolean {
  const { lockEnabled, delay, backgroundedAt, now } = args;
  if (!lockEnabled || delay === "never" || backgroundedAt === null) return false;
  return now - backgroundedAt >= delayMs(delay);
}

/**
 * Foreground inactivity locking. "Immediately" only applies to backgrounding,
 * so an actively used app is never locked out from under the user.
 */
export function shouldLockOnInactivity(args: {
  lockEnabled: boolean;
  delay: AutoLockDelay;
  lastActivityAt: number;
  now: number;
}): boolean {
  const { lockEnabled, delay, lastActivityAt, now } = args;
  if (!lockEnabled || delay === "never" || delay === "immediate") return false;
  return now - lastActivityAt >= delayMs(delay);
}

/** Cold launch always locks when a lock credential exists. */
export function shouldLockOnColdLaunch(lockEnabled: boolean): boolean {
  return lockEnabled;
}
