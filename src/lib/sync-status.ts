/**
 * Tiny global sync/connectivity store.
 *
 * The NOVA data store reports honest cloud state here so the UI can tell the
 * user the truth: "saved", "saving", "offline" or "not synced". It deliberately
 * has no dependency on React context so `nova-store` can update it from inside
 * effects without re-render loops.
 */
export type SyncState =
  | "local" // guest / signed out — local only, nothing to sync
  | "synced" // last cloud write succeeded
  | "saving" // a cloud write is in flight
  | "offline" // browser reports no network
  | "load-error" // cloud read failed — the app stays read-only for the cloud
  | "save-error"; // cloud write failed — local edits are NOT in the cloud


let current: SyncState = "local";
const listeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return current;
}

export function setSyncState(next: SyncState) {
  if (current === next) return;
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Server snapshot for useSyncExternalStore (SSR renders nothing special). */
export function getSyncServerState(): SyncState {
  return "local";
}
