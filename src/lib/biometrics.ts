/**
 * Biometric abstraction (Face ID / Touch ID).
 *
 * Native only. On the web the status is always `web-unavailable` and the UI
 * must say "Requires native app" — we never fake a successful authentication.
 */
import { isNativeShell } from "@/lib/native";

export type BiometryKind = "faceId" | "touchId" | "fingerprint" | "none";

export type BiometricStatus = {
  available: boolean;
  kind: BiometryKind;
  /** Why it is unavailable, when it is. */
  reason?: "web" | "unsupported" | "not-enrolled" | "error";
};

export type BiometricResult = "success" | "failed" | "cancelled" | "unavailable";

export type BiometricProvider = {
  status(): Promise<BiometricStatus>;
  authenticate(reason: string): Promise<BiometricResult>;
};

const webProvider: BiometricProvider = {
  async status() {
    return { available: false, kind: "none", reason: "web" };
  },
  async authenticate() {
    return "unavailable";
  },
};

let override: BiometricProvider | null = null;

/** Test seam — lets the suite simulate success / failure / cancel / no device. */
export function __setBiometricProviderForTests(p: BiometricProvider | null) {
  override = p;
}

function mapKind(type: unknown): BiometryKind {
  const s = String(type);
  if (s.includes("face") || s === "1") return "faceId";
  if (s.includes("touch") || s === "2") return "touchId";
  if (s.includes("finger") || s === "3") return "fingerprint";
  return "none";
}

async function nativeProvider(): Promise<BiometricProvider> {
  const mod = await import("@aparajita/capacitor-biometric-auth");
  const bio = mod.BiometricAuth;
  return {
    async status() {
      try {
        const info = await bio.checkBiometry();
        if (!info.isAvailable) {
          return {
            available: false,
            kind: mapKind(info.biometryType),
            reason: String(info.reason ?? "").toLowerCase().includes("enroll")
              ? "not-enrolled"
              : "unsupported",
          };
        }
        return { available: true, kind: mapKind(info.biometryType) };
      } catch {
        return { available: false, kind: "none", reason: "error" };
      }
    },
    async authenticate(reason: string) {
      try {
        await bio.authenticate({
          reason,
          cancelTitle: "Cancel",
          allowDeviceCredential: false,
          iosFallbackTitle: "",
        });
        return "success";
      } catch (e) {
        const code = String((e as { code?: string })?.code ?? "").toLowerCase();
        if (code.includes("cancel")) return "cancelled";
        if (code.includes("notavailable") || code.includes("notenrolled")) return "unavailable";
        return "failed";
      }
    },
  };
}

async function provider(): Promise<BiometricProvider> {
  if (override) return override;
  if (!isNativeShell()) return webProvider;
  try {
    return await nativeProvider();
  } catch {
    return webProvider;
  }
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  return (await provider()).status();
}

export async function authenticateBiometric(reason: string): Promise<BiometricResult> {
  return (await provider()).authenticate(reason);
}
