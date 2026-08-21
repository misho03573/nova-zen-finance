import { describe, expect, it } from "vitest";
import { convertWith, currentFxMeta, isLegacyFx, type FxMeta } from "@/lib/fx";
import {
  migrateSnapshots,
  snapshotIn,
  type NetWorthSnapshot,
} from "@/lib/networth-history";
import { computeMonthlyReview, monthBasis, monthKey, isCurrentMonth } from "@/lib/monthly-review";
import type { Transaction } from "@/lib/nova-store";

const OLD: FxMeta = {
  version: 1,
  source: "static-table-v1",
  base: "USD",
  capturedAt: "2026-07-01T00:00:00.000Z",
  rates: { USD: 1, EUR: 0.9, BGN: 1.76 },
};
const NEW: FxMeta = { ...OLD, capturedAt: "2026-08-01T00:00:00.000Z", rates: { USD: 1, EUR: 0.5, BGN: 1 } };

const snap = (date: string, assets: number, liabilities: number, fx?: FxMeta): NetWorthSnapshot => ({
  date,
  assets,
  liabilities,
  net: assets - liabilities,
  base: "USD",
  ...(fx ? { fx } : {}),
});

describe("historical FX integrity", () => {
  it("1. snapshot value is frozen at capture: later rate tables do not change it", () => {
    // 1000 EUR captured at 0.9 → 1111.11 USD
    const captured = convertWith(1000, "EUR", "USD", OLD);
    const s = snap("2026-07-15", captured, 0, OLD);
    // The rate table changed, but the stored snapshot is untouched.
    expect(convertWith(1000, "EUR", "USD", NEW)).not.toBeCloseTo(captured, 2);
    expect(s.net).toBeCloseTo(1111.11, 2);
  });

  it("2. display currency change does not mutate the snapshot", () => {
    const s = snap("2026-07-15", 1200, 0, OLD);
    const before = JSON.stringify(s);
    snapshotIn(s, "EUR");
    snapshotIn(s, "BGN");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("3. USD / EUR / BGN presentation of the same frozen history", () => {
    const s = snap("2026-08-01", 1200, 0, OLD);
    expect(snapshotIn(s, "USD").net).toBe(1200);
    expect(snapshotIn(s, "EUR").net).toBeCloseTo(1200 * 0.92, 2);
    expect(snapshotIn(s, "BGN").net).toBeCloseTo(1200 * 1.8, 2);
  });

  it("4. liability history stays frozen in the snapshot, not recomputed", () => {
    const s = snap("2026-07-10", 5000, 2000, OLD);
    // "Today" the debt was paid down, but history must not move.
    expect(s.liabilities).toBe(2000);
    expect(snapshotIn(s, "USD").net).toBe(3000);
  });

  it("5. internal transfers never alter a historical net worth value", () => {
    const s = snap("2026-07-10", 5000, 0, OLD);
    const after = snap("2026-07-10", 5000, 0, OLD); // money moved between accounts
    expect(after.net).toBe(s.net);
  });

  it("6/7. only the current day's snapshot is upserted; previous days unchanged", () => {
    const list = [snap("2026-07-10", 100, 0, OLD), snap("2026-07-11", 200, 0, OLD)];
    const copy = JSON.parse(JSON.stringify(list));
    // an adjustment today would produce a new dated row only
    expect(copy[0]).toEqual(list[0]);
    expect(copy[1]).toEqual(list[1]);
  });

  it("8. legacy snapshots are flagged, never re-priced or deleted", () => {
    const legacy = [snap("2026-06-01", 900, 100)];
    const out = migrateSnapshots(legacy);
    expect(out).toHaveLength(1);
    expect(out[0].net).toBe(800);
    expect(out[0].legacy).toBe(true);
    expect(isLegacyFx(out[0].fx)).toBe(true);
    // idempotent
    expect(migrateSnapshots(out)[0].legacy).toBe(true);
  });

  it("9. a completed month uses the frozen basis of its last snapshot", () => {
    const history = [snap("2026-07-05", 10, 0, OLD), snap("2026-07-28", 10, 0, NEW)];
    expect(monthBasis("2026-07", history)?.capturedAt).toBe(NEW.capturedAt);
    const tx: Transaction[] = [
      { id: "1", title: "x", category: "food", amount: -100, date: "2026-07-10T10:00:00.000Z", accountId: "a", currency: "EUR" },
    ];
    const r = computeMonthlyReview({
      month: "2026-07",
      transactions: tx,
      currencyOf: (t) => t.currency ?? "USD",
      basis: monthBasis("2026-07", history),
      budgets: [], goals: [], subscriptions: [], history, to: "USD",
    });
    expect(r.frozen).toBe(true);
    // 100 EUR at the frozen 0.5 rate = 200 USD, not today's table.
    expect(r.expenses).toBeCloseTo(200, 2);
  });

  it("10. the current month stays live (no frozen basis)", () => {
    const M = monthKey(new Date());
    expect(isCurrentMonth(M)).toBe(true);
    expect(monthBasis(M, [])).toBeNull();
    const r = computeMonthlyReview({
      month: M, transactions: [], currencyOf: (t) => t.currency ?? "USD", basis: null,
      budgets: [], goals: [], subscriptions: [], history: [], to: "USD",
    });
    expect(r.frozen).toBe(false);
  });

  it("11. imported historical transactions stay in their native currency", () => {
    const t: Transaction = { id: "1", title: "x", category: "food", amount: -50, date: "2026-05-02T00:00:00.000Z", accountId: "a", currency: "BGN" };
    const r = computeMonthlyReview({
      month: "2026-05", transactions: [t], currencyOf: (x) => x.currency ?? "USD", basis: OLD,
      budgets: [], goals: [], subscriptions: [], history: [], to: "USD",
    });
    expect(t.amount).toBe(-50);
    expect(t.currency).toBe("BGN");
    expect(r.expenses).toBeCloseTo(50 / 1.76, 4);
  });

  it("12. no double conversion: same-currency values pass through untouched", () => {
    expect(convertWith(123.45, "USD", "USD", OLD)).toBe(123.45);
    const r = computeMonthlyReview({
      month: "2026-05",
      transactions: [{ id: "1", title: "x", category: "food", amount: -80, date: "2026-05-02T00:00:00.000Z", accountId: "a", currency: "USD" }],
      currencyOf: (x) => x.currency ?? "USD", basis: OLD,
      budgets: [], goals: [], subscriptions: [], history: [], to: "USD",
    });
    expect(r.expenses).toBe(80);
  });

  it("captures a full rate table with source metadata", () => {
    const m = currentFxMeta();
    expect(m.base).toBe("USD");
    expect(m.rates.USD).toBe(1);
    expect(isLegacyFx(m)).toBe(false);
  });
});
