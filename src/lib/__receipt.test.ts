import { describe, it, expect, beforeEach } from "vitest";
import {
  RECEIPT_MAX_BYTES,
  validateReceiptFile,
  ScanReceiptInput,
  assertReceiptPayload,
  normalizeReceipt,
  parseReceiptJson,
  runReceiptScan,
  resetReceiptRateLimitsForTests,
  type ScanReceiptData,
} from "@/lib/receipt-core";

const CATS = ["food", "shopping", "transport", "other"];
const NOW = Date.parse("2026-03-10T00:00:00Z");
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function data(overrides: Partial<ScanReceiptData> = {}): ScanReceiptData {
  return {
    mimeType: "image/png",
    imageDataUrl: `data:image/png;base64,${PIXEL}`,
    locale: "en",
    currency: "EUR",
    categories: CATS,
    ...overrides,
  } as ScanReceiptData;
}

beforeEach(() => resetReceiptRateLimitsForTests());

describe("file validation", () => {
  it("rejects unsupported types, empty and oversized files", () => {
    expect(validateReceiptFile({ type: "application/pdf", size: 100 })).toBe("type");
    expect(validateReceiptFile({ type: "image/png", size: 0 })).toBe("empty");
    expect(validateReceiptFile({ type: "image/png", size: RECEIPT_MAX_BYTES + 1 })).toBe("size");
    expect(validateReceiptFile({ type: "image/jpeg", size: 1024 })).toBeNull();
  });
});

describe("input schema", () => {
  it("accepts a valid payload and rejects extra or bad fields", () => {
    expect(ScanReceiptInput.safeParse(data()).success).toBe(true);
    expect(ScanReceiptInput.safeParse({ ...data(), evil: 1 }).success).toBe(false);
    expect(ScanReceiptInput.safeParse(data({ mimeType: "application/pdf" as never })).success).toBe(false);
    expect(ScanReceiptInput.safeParse(data({ categories: ["../etc"] })).success).toBe(false);
    expect(ScanReceiptInput.safeParse(data({ categories: [] })).success).toBe(false);
  });
});

describe("payload assertion", () => {
  it("rejects a mime/data mismatch and non-base64 payloads", () => {
    expect(() => assertReceiptPayload(data({ imageDataUrl: `data:image/jpeg;base64,${PIXEL}` }))).toThrow();
    expect(() => assertReceiptPayload(data({ imageDataUrl: "data:image/png;base64,!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" }))).toThrow();
    expect(assertReceiptPayload(data()).base64).toBe(PIXEL);
  });
});

describe("normalizeReceipt", () => {
  it("clamps amounts, dates, currency and category", () => {
    const draft = normalizeReceipt(
      { merchant: "  Lidl  ", date: "2026-03-01", total: "-24,90", tax: "4.15", currency: "eur", category: "FOOD" },
      { categories: CATS, fallbackCurrency: "USD", now: NOW },
    );
    expect(draft).toEqual({ merchant: "Lidl", date: "2026-03-01", total: 24.9, tax: 4.15, currency: "EUR", category: "food" });
  });

  it("falls back safely on garbage, future dates and unknown categories", () => {
    const draft = normalizeReceipt(
      { merchant: null, date: "2099-01-01", total: "abc", tax: 99, currency: "XXX", category: "crypto" },
      { categories: CATS, fallbackCurrency: "USD", now: NOW },
    );
    expect(draft.total).toBe(0);
    expect(draft.tax).toBeNull();
    expect(draft.currency).toBe("USD");
    expect(draft.category).toBe("other");
    expect(draft.date).toBe("2026-03-10");
  });

  it("never returns non-finite money", () => {
    const draft = normalizeReceipt(
      { merchant: "x", date: null, total: Number.POSITIVE_INFINITY, tax: Number.NaN, currency: null, category: null },
      { categories: CATS, fallbackCurrency: "BGN", now: NOW },
    );
    expect(Number.isFinite(draft.total)).toBe(true);
    expect(draft.tax).toBeNull();
  });
});

describe("parseReceiptJson", () => {
  it("unwraps fenced JSON and throws on prose", () => {
    expect(parseReceiptJson('```json\n{"total": 5}\n```')).toEqual({ total: 5 });
    expect(() => parseReceiptJson("I cannot read this receipt.")).toThrow();
  });
});

describe("runReceiptScan", () => {
  const ok = async () =>
    JSON.stringify({ merchant: "Cafe", date: "2026-03-09", total: 12.5, tax: 2.1, currency: "EUR", category: "food" });

  it("requires an authenticated user", async () => {
    const result = await runReceiptScan({ userId: "", data: data(), extract: ok });
    expect(result).toEqual({ ok: false, code: "unauthorized", retryable: false });
  });

  it("returns an editable draft on success", async () => {
    const result = await runReceiptScan({ userId: "u1", data: data(), extract: ok, now: NOW });
    expect(result.ok && result.draft.merchant).toBe("Cafe");
    expect(result.ok && result.draft.total).toBe(12.5);
  });

  it("does not send the image when the payload is inconsistent", async () => {
    let called = false;
    const result = await runReceiptScan({
      userId: "u1",
      data: data({ imageDataUrl: `data:image/jpeg;base64,${PIXEL}` }),
      extract: async () => { called = true; return ""; },
    });
    expect(called).toBe(false);
    expect(result).toEqual({ ok: false, code: "invalid", retryable: false });
  });

  it("reports unreadable receipts instead of inventing a transaction", async () => {
    const result = await runReceiptScan({
      userId: "u1",
      data: data(),
      extract: async () => JSON.stringify({ merchant: null, date: null, total: null, tax: null, currency: null, category: null }),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, code: "unreadable", retryable: true });
  });

  it("sanitizes provider failures", async () => {
    const result = await runReceiptScan({
      userId: "u1",
      data: data(),
      extract: async () => { throw Object.assign(new Error("secret key leaked"), { statusCode: 402 }); },
    });
    expect(result).toEqual({ ok: false, code: "credits", retryable: false });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rate limits repeated scans per user", async () => {
    const results = [];
    for (let i = 0; i < 8; i += 1) {
      results.push(await runReceiptScan({ userId: "u-rate", data: data(), extract: ok, now: NOW }));
    }
    expect(results.filter((r) => !r.ok && r.code === "rate_limited").length).toBeGreaterThan(0);
    const other = await runReceiptScan({ userId: "u-other", data: data(), extract: ok, now: NOW });
    expect(other.ok).toBe(true);
  });
});
