import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, WifiOff } from "lucide-react";
import {
  getSyncServerState,
  getSyncState,
  setSyncState,
  subscribeSync,
} from "@/lib/sync-status";
import { useT } from "@/lib/i18n";

/** Watches the browser's online/offline events and mirrors them into the store. */
function useOnlineWatcher() {
  useEffect(() => {
    const apply = () => {
      if (!navigator.onLine) setSyncState("offline");
      else if (getSyncState() === "offline") setSyncState("local");
    };
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);
}

/**
 * Small global banner shown only when something is wrong: the device is
 * offline, or a cloud read/write failed. It never claims data is synced.
 */
export function SyncIndicator() {
  const tr = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useOnlineWatcher();
  const status = useSyncExternalStore(subscribeSync, getSyncState, getSyncServerState);

  if (!mounted) return null;
  if (status !== "offline" && status !== "load-error" && status !== "save-error") return null;

  const offline = status === "offline";
  const Icon = offline ? WifiOff : CloudOff;
  const message = offline
    ? tr("sync.offline")
    : status === "load-error"
      ? tr("sync.loadError")
      : tr("sync.saveError");

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[var(--nav-clearance)] z-[60] flex justify-center px-4"
    >
      <div className="mb-1 flex max-w-[min(26rem,100%)] items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-card)] backdrop-blur">
        <Icon className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0">{message}</span>
      </div>
    </div>
  );
}
