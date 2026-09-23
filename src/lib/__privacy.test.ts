import { describe, expect, it } from "vitest";
import { buildAiSnapshot, FORBIDDEN_SNAPSHOT_KEYS, snapshotLines } from "@/lib/ai-context";
import type { FinancialContext } from "@/lib/financial-context";
import {
  clearLocalNovaData,
  isSensitiveKey,
  redactStorageKey,
  sensitiveKeys,
  storeKeyFor,
} from "@/lib/local-cache";

const UID_A = "11111111-2222-3333-4444-555555555555";
const UID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function ctx(): FinancialContext {
  return {
    month: "2026-08",
    netWorth: 1000,
    assets: 1500,
    liabilities: 500,
    liquid: 800,
    income: 3000,
    expenses: 2000,
    savings: 1000,
    savingsRate: 33,
    txCount: 12,
    topCategories: [{ category: "food", amount: 320 }],
    prevCategories: { food: 280 },
    topMerchants: [{ label: "Netflix", amount: 15 }],
    budgets: [{ category: "food", limit: 400, spent: 320, pct: 0.8, over: false, near: true }],
    goals: [{ pct: 0.5, target: 1000, saved: 500 }],
    subscriptions: { count: 2, monthly: 30 },
    debt: { total: 500, highestApr: { apr: 19.9 } },
    runway: { essentialRunway: 4, totalRunway: 3 },
    forecast30: { endBalance: 900, lowest: 400, negativeDate: null, bufferDate: null },
    upcoming: [],
    // Fields below exist on the real context but must never reach the snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("AI privacy boundary", () => {
  it("never exposes identifying or free-text fields", () => {
    const snap = buildAiSnapshot(ctx());
    const json = JSON.stringify(snap);
    for (const key of FORBIDDEN_SNAPSHOT_KEYS) {
      expect(json.includes(`"${key}":`)).toBe(false);
    }
  });

  it("omits merchant names unless explicitly opted in", () => {
    expect(JSON.stringify(buildAiSnapshot(ctx()))).not.toContain("Netflix");
    expect(JSON.stringify(buildAiSnapshot(ctx(), { includeMerchants: true }))).toContain("Netflix");
  });

  it("keeps prompt lines free of merchant labels by default", () => {
    expect(snapshotLines(buildAiSnapshot(ctx())).join("\n")).not.toContain("Netflix");
  });
});

describe("local cache isolation", () => {
  it("scopes the store key per user", () => {
    expect(storeKeyFor(UID_A)).not.toBe(storeKeyFor(UID_B));
    expect(storeKeyFor(null)).toBe("nova.store.v3");
  });

  it("clears the signed-in user's financial keys but not another user's", () => {
    const store: Record<string, string> = {
      [storeKeyFor(UID_A)]: "{}",
      [storeKeyFor(UID_B)]: "{}",
      "nova.store.v3": "{}",
      [`nova.txfilters.v1.${UID_A}`]: "{}",
      [`nova.recovery.v1.${UID_A}`]: "{}",
      "nova.theme": "dark",
      "nova.onboarded.v1": "1",
    };
    const g = globalThis as unknown as { window?: unknown };
    const prev = g.window;
    g.window = {
      localStorage: {
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    };
    clearLocalNovaData(UID_A);
    g.window = prev;

    expect(store[storeKeyFor(UID_A)]).toBeUndefined();
    expect(store["nova.store.v3"]).toBeUndefined();
    expect(store[`nova.txfilters.v1.${UID_A}`]).toBeUndefined();
    expect(store[`nova.recovery.v1.${UID_A}`]).toBeUndefined();
    // Another account's cache is untouched — only its owner can clear it.
    expect(store[storeKeyFor(UID_B)]).toBe("{}");
    // Non-sensitive preferences survive.
    expect(store["nova.theme"]).toBe("dark");
    expect(store["nova.onboarded.v1"]).toBe("1");
  });

  it("classifies financial keys as sensitive", () => {
    expect(isSensitiveKey(storeKeyFor(UID_A))).toBe(true);
    expect(isSensitiveKey("nova.txfilters.v1.guest")).toBe(true);
    expect(isSensitiveKey(`nova.recovery.v1.${UID_A}`)).toBe(true);
    expect(isSensitiveKey("nova.theme")).toBe(false);
    expect(sensitiveKeys(UID_A)).toContain(storeKeyFor(UID_A));
    expect(sensitiveKeys(null)).not.toContain(storeKeyFor(UID_A));
  });

  it("redacts user ids from diagnostics keys", () => {
    expect(redactStorageKey(storeKeyFor(UID_A))).toBe("nova.store.v3.<user>");
    expect(redactStorageKey("nova.theme")).toBe("nova.theme");
  });
});
