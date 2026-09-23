/**
 * Receipt-to-transaction extraction core (pure, testable).
 *
 * Privacy contract: the selected image is sent to the platform-managed AI
 * service only to extract transaction fields. It is never persisted, never
 * written to the financial state, and never included in cloud sync. The server
 * holds the bytes only for the duration of one request.
 */
import { z } from "zod";
import { classifyAiError, type AiErrorCode } from "@/lib/ai-assistant-core";

export const RECEIPT_MAX_BYTES = 6 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export type ReceiptMime = (typeof RECEIPT_MIME_TYPES)[number];

export const RECEIPT_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "BGN",
] as const;
export type ReceiptCurrency = (typeof RECEIPT_CURRENCIES)[number];

export type ReceiptImageIssue = "type" | "size" | "empty";

/** Client-side guard for an explicitly chosen file, before any upload happens. */
export function validateReceiptFile(file: { type: string; size: number }): ReceiptImageIssue | null {
  if (!RECEIPT_MIME_TYPES.includes(file.type as ReceiptMime)) return "type";
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty";
  if (file.size > RECEIPT_MAX_BYTES) return "size";
  return null;
}

/** Base64 payload length that can still fit within the byte budget. */
const MAX_DATA_URL_LENGTH = Math.ceil((RECEIPT_MAX_BYTES / 3) * 4) + 128;

export const ScanReceiptInput = z.object({
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  /** `data:<mime>;base64,<payload>` — held in memory for this request only. */
  imageDataUrl: z.string().min(32).max(MAX_DATA_URL_LENGTH),
  locale: z.enum(["en", "bg", "de", "fr", "es"]),
  currency: z.enum(RECEIPT_CURRENCIES),
  categories: z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/i)).min(1).max(60),
}).strict();

export type ScanReceiptData = z.infer<typeof ScanReceiptInput>;

/** Rejects mismatched or oversized payloads server-side; never trust the client. */
export function assertReceiptPayload(data: ScanReceiptData): { base64: string } {
  const prefix = `data:${data.mimeType};base64,`;
  if (!data.imageDataUrl.startsWith(prefix)) {
    throw Object.assign(new Error("Declared type does not match image data"), { receiptCode: "invalid" as const });
  }
  const base64 = data.imageDataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw Object.assign(new Error("Image payload is not base64"), { receiptCode: "invalid" as const });
  }
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes <= 0 || bytes > RECEIPT_MAX_BYTES) {
    throw Object.assign(new Error("Image payload exceeds the size limit"), { receiptCode: "invalid" as const });
  }
  return { base64 };
}

/** Raw model output contract — deliberately limited to receipt transaction fields. */
export const ReceiptModelOutput = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  total: z.union([z.number(), z.string()]).nullable(),
  tax: z.union([z.number(), z.string()]).nullable(),
  currency: z.string().nullable(),
  category: z.string().nullable(),
});

export type ReceiptDraft = {
  merchant: string;
  date: string;
  total: number;
  tax: number | null;
  currency: ReceiptCurrency;
  category: string;
};

function toAmount(value: number | string | null): number | null {
  if (value === null) return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(value.replace(/[^0-9.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.abs(numeric) * 100) / 100;
}

function toIsoDate(value: string | null, now: number): string {
  const fallback = new Date(now).toISOString().slice(0, 10);
  if (!value) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return fallback;
  const parsed = Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return fallback;
  // Reject impossible dates: far future or older than 10 years.
  if (parsed > now + 86_400_000 || parsed < now - 10 * 365 * 86_400_000) return fallback;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Clamps model output into a safe, finite draft. Never throws on odd values —
 * the user always gets an editable form, never an auto-created transaction.
 */
export function normalizeReceipt(
  raw: unknown,
  options: { categories: string[]; fallbackCurrency: ReceiptCurrency; now?: number },
): ReceiptDraft {
  const now = options.now ?? Date.now();
  const parsed = ReceiptModelOutput.safeParse(raw);
  const value = parsed.success ? parsed.data : { merchant: null, date: null, total: null, tax: null, currency: null, category: null };

  const total = toAmount(value.total) ?? 0;
  let tax = toAmount(value.tax);
  if (tax !== null && (tax <= 0 || tax > total)) tax = null;

  const currencyCandidate = (value.currency ?? "").trim().toUpperCase();
  const currency = (RECEIPT_CURRENCIES as readonly string[]).includes(currencyCandidate)
    ? (currencyCandidate as ReceiptCurrency)
    : options.fallbackCurrency;

  const categoryCandidate = (value.category ?? "").trim().toLowerCase();
  const category = options.categories.includes(categoryCandidate)
    ? categoryCandidate
    : (options.categories.includes("other") ? "other" : options.categories[0]);

  return {
    merchant: (value.merchant ?? "").trim().slice(0, 80),
    date: toIsoDate(value.date, now),
    total,
    tax,
    currency,
    category,
  };
}

/** Pulls the first JSON object out of a model reply and validates it. */
export function parseReceiptJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw Object.assign(new Error("Model did not return JSON"), { receiptCode: "empty" as const });
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export type ReceiptErrorCode = AiErrorCode | "unreadable";
export type ScanReceiptResult =
  | { ok: true; draft: ReceiptDraft }
  | { ok: false; code: ReceiptErrorCode; retryable: boolean };

type RateEntry = { startedAt: number; count: number };
const rateEntries = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6;

export function consumeReceiptRateLimit(userId: string, now = Date.now()): boolean {
  const current = rateEntries.get(userId);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateEntries.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

export function resetReceiptRateLimitsForTests() {
  rateEntries.clear();
}

export async function runReceiptScan(args: {
  userId: string;
  data: ScanReceiptData;
  extract: (input: { data: ScanReceiptData; base64: string }) => Promise<string>;
  now?: number;
}): Promise<ScanReceiptResult> {
  if (!args.userId) return { ok: false, code: "unauthorized", retryable: false };
  if (!consumeReceiptRateLimit(args.userId)) return { ok: false, code: "rate_limited", retryable: true };
  try {
    const { base64 } = assertReceiptPayload(args.data);
    const text = await args.extract({ data: args.data, base64 });
    const draft = normalizeReceipt(parseReceiptJson(text), {
      categories: args.data.categories,
      fallbackCurrency: args.data.currency,
      ...(args.now === undefined ? {} : { now: args.now }),
    });
    if (!(draft.total > 0) && !draft.merchant) {
      return { ok: false, code: "unreadable", retryable: true };
    }
    return { ok: true, draft };
  } catch (error) {
    const tagged = (error as { receiptCode?: ReceiptErrorCode } | null)?.receiptCode;
    if (tagged === "invalid") return { ok: false, code: "invalid", retryable: false };
    if (tagged === "empty") return { ok: false, code: "unreadable", retryable: true };
    if (error instanceof SyntaxError) return { ok: false, code: "unreadable", retryable: true };
    return classifyAiError(error);
  }
}
