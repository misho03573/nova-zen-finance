/**
 * PIN credential handling.
 *
 * The PIN itself is never persisted. We store a PBKDF2-SHA256 hash with a
 * random per-credential salt, in secure storage (Keychain on iOS).
 */
export type PinCredential = {
  v: 1;
  salt: string; // hex
  hash: string; // hex
  iterations: number;
  createdAt: string;
};

export const PIN_LENGTH = 6;
export const PIN_ITERATIONS = 120_000;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto unavailable");
  return c.subtle;
}

export async function hashPin(
  pin: string,
  saltHex: string,
  iterations = PIN_ITERATIONS,
): Promise<string> {
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex) as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export async function createPinCredential(pin: string): Promise<PinCredential> {
  if (!isValidPin(pin)) throw new Error("invalid-pin");
  const salt = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)).buffer);
  return {
    v: 1,
    salt,
    hash: await hashPin(pin, salt),
    iterations: PIN_ITERATIONS,
    createdAt: new Date().toISOString(),
  };
}

/** Constant-time-ish comparison of the derived hashes. */
export async function verifyPin(pin: string, cred: PinCredential | null): Promise<boolean> {
  if (!cred || !isValidPin(pin)) return false;
  const candidate = await hashPin(pin, cred.salt, cred.iterations);
  if (candidate.length !== cred.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ cred.hash.charCodeAt(i);
  return diff === 0;
}
