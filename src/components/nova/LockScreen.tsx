import { useEffect, useRef, useState } from "react";
import { Fingerprint, Lock, ScanFace } from "lucide-react";
import { useLock } from "@/lib/lock";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Full-screen lock. Rendered above everything, so no financial data is
 * painted while the app is locked.
 */
export function LockScreen() {
  const lock = useLock();
  const t = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  const bioLabel =
    lock.biometricStatus.kind === "faceId"
      ? t("lock.useFaceId")
      : lock.biometricStatus.kind === "touchId"
        ? t("lock.useTouchId")
        : t("lock.useBiometrics");

  const runBiometric = async () => {
    setBusy(true);
    const res = await lock.unlockWithBiometric(t("lock.bioReason"));
    setBusy(false);
    if (res === "cancelled") setError(t("lock.bioCancelled"));
    else if (res === "failed") setError(t("lock.bioFailed"));
    else if (res === "unavailable") setError(t("lock.bioUnavailable"));
  };

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    if (lock.biometricEnabled && lock.biometricStatus.available) void runBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.biometricEnabled, lock.biometricStatus.available]);

  const submit = async () => {
    setBusy(true);
    const ok = await lock.unlockWithPin(pin);
    setBusy(false);
    if (!ok) {
      setError(t("lock.wrong"));
      setPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 text-primary">
        <Lock className="h-7 w-7" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold">{t("lock.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("lock.subtitle")}</p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          aria-label={t("lock.subtitle")}
          className="text-center text-2xl tracking-[0.5em]"
          value={pin}
          onChange={(e) => {
            setError(null);
            setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pin.length === 6) void submit();
          }}
        />
        {error ? <p role="alert" className="text-center text-xs text-destructive">{error}</p> : null}
        <Button className="w-full" disabled={pin.length !== 6 || busy} onClick={() => void submit()}>
          {t("lock.unlock")}
        </Button>
        {lock.biometricEnabled && lock.biometricStatus.available ? (
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => void runBiometric()}
          >
            {lock.biometricStatus.kind === "faceId" ? (
              <ScanFace className="h-4 w-4" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            {bioLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
