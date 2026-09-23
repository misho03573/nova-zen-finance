import { describe, it, expect } from "vitest";
import {
  scanDataHealth,
  findDuplicates,
  findOutliers,
  HEALTH_KINDS,
  OUTLIER_MIN_SAMPLES,
  type HealthInput,
} from "@/lib/data-health";
import type { Account, Recurring, Subscription, Transaction } from "@/lib/nova-store";

const NOW = Date.parse("2026-04-10T10:00:00.000Z");
const DAY = 86_400_000;
const iso = (d: number) => new Date(NOW + d * DAY).toISOString();

const acc = (id: string): Account =>
  ({ id, name: id, type: "bank", balance: 100, currency: "USD", number: "•• 01", gradient: "", brand: "", holder: "" }) as Account;

const tx = (o: Partial<Transaction> & { id: string }): Transaction =>
  ({
    title: "Coffee",
    category: "food",
    amount: -10,
    date: iso(-1),
    accountId: "a1",
    ...o,
  }) as Transaction;

const base = (o: Partial<HealthInput> = {}): HealthInput => ({
  accounts: [acc("a1"), acc("a2")],
  transactions: [],
  recurring: [],
  subscriptions: [],
  categoryIds: ["food", "home", "fun"],
  now: NOW,
  ...o,
});

describe("duplicate detection", () => {
  it("flags the same merchant, amount and account on the same day with high confidence", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          tx({ id: "t1", title: "LIDL 1248 SOFIA", amount: -24.5, date: iso(-2) }),
          tx({ id: "t2", title: "LIDL*0820", amount: -24.5, date: iso(-2) }),
        ],
      }),
    );
    const dup = r.groups.find((g) => g.kind === "duplicate")!;
    expect(dup.findings).toHaveLength(1);
    expect(dup.findings[0]!.confidence).toBe("high");
    expect(dup.findings[0]!.refs.sort()).toEqual(["t1", "t2"]);
  });

  it("lowers confidence as the gap grows and ignores gaps beyond the window", () => {
    const near = findDuplicates(
      cleanRows([tx({ id: "t1", amount: -9 }), tx({ id: "t2", amount: -9, date: iso(0) })]),
    );
    expect(near[0]!.confidence).toBe("medium");

    const far = scanDataHealth(
      base({
        transactions: [tx({ id: "t1", amount: -9, date: iso(-10) }), tx({ id: "t2", amount: -9, date: iso(-2) })],
      }),
    );
    expect(far.groups.some((g) => g.kind === "duplicate")).toBe(false);
  });

  it("does not flag different accounts, different amounts, different merchants or opposite signs", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          tx({ id: "a", amount: -20, accountId: "a1" }),
          tx({ id: "b", amount: -20, accountId: "a2" }),
          tx({ id: "c", amount: -21, accountId: "a1" }),
          tx({ id: "d", amount: 20, accountId: "a1" }),
          tx({ id: "e", amount: -20, accountId: "a1", title: "Bakery" }),
        ],
      }),
    );
    expect(r.groups.some((g) => g.kind === "duplicate")).toBe(false);
  });

  it("never flags the two legs of a transfer or a reconciliation record", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          tx({ id: "t1", title: "Transfer", category: "transfer", amount: -50, transferId: "x", accountId: "a1" }),
          tx({ id: "t2", title: "Transfer", category: "transfer", amount: 50, transferId: "x", accountId: "a2" }),
          tx({ id: "t3", title: "Adjust", kind: "adjustment", category: "adjustment", amount: -5 }),
          tx({ id: "t4", title: "Adjust", kind: "adjustment", category: "adjustment", amount: -5 }),
        ],
      }),
    );
    expect(r.groups.some((g) => g.kind === "duplicate")).toBe(false);
  });

  it("pairs each record at most once in a triple charge", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          tx({ id: "t1", amount: -7, date: iso(-3) }),
          tx({ id: "t2", amount: -7, date: iso(-3) }),
          tx({ id: "t3", amount: -7, date: iso(-3) }),
        ],
      }),
    );
    const dup = r.groups.find((g) => g.kind === "duplicate")!;
    expect(dup.findings).toHaveLength(1);
  });
});

// Small helper so a rule can be exercised directly with clean rows.
function cleanRows(txs: Transaction[]) {
  return txs.map((t) => ({
    id: t.id,
    title: t.title,
    merchantKey: t.title.toLowerCase().replace(/[^a-z0-9]/g, ""),
    category: t.category,
    amount: t.amount,
    ts: Date.parse(t.date),
    date: t.date,
    accountId: t.accountId,
    transfer: false,
  }));
}

describe("field completeness", () => {
  it("flags missing description, missing account and zero amounts", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          tx({ id: "t1", title: "" }),
          tx({ id: "t2", accountId: "gone" }),
          tx({ id: "t3", amount: 0 }),
        ],
      }),
    );
    const inc = r.groups.find((g) => g.kind === "incomplete")!;
    expect(inc.findings.map((f) => f.reasonKey).sort()).toEqual([
      "dh.reason.noAccount",
      "dh.reason.noTitle",
      "dh.reason.zeroAmount",
    ]);
  });

  it("flags vague and unknown categories separately", () => {
    const r = scanDataHealth(
      base({
        transactions: [tx({ id: "t1", category: "other" }), tx({ id: "t2", category: "ghost" })],
      }),
    );
    const cat = r.groups.find((g) => g.kind === "uncategorized")!;
    expect(cat.findings.find((f) => f.refs[0] === "t1")!.reasonKey).toBe("dh.reason.noCategory");
    expect(cat.findings.find((f) => f.refs[0] === "t2")!.reasonKey).toBe("dh.reason.unknownCategory");
  });
});

describe("outliers", () => {
  const history = (n: number, amount: number, prefix: string) =>
    Array.from({ length: n }, (_, i) =>
      tx({ id: `${prefix}${i}`, amount: -amount, date: iso(-30 + i), title: `Shop ${i}` }),
    );

  it("needs enough comparable history before flagging", () => {
    const r = scanDataHealth(
      base({
        transactions: [...history(OUTLIER_MIN_SAMPLES - 2, 10, "h"), tx({ id: "big", amount: -900 })],
      }),
    );
    expect(r.groups.some((g) => g.kind === "outlier")).toBe(false);
  });

  it("flags an expense far above the category median and scales confidence", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          ...history(10, 10, "h"),
          tx({ id: "mid", amount: -60, title: "Mid" }),
          tx({ id: "huge", amount: -400, title: "Huge" }),
        ],
      }),
    );
    const out = r.groups.find((g) => g.kind === "outlier")!;
    expect(out.findings.find((f) => f.refs[0] === "huge")!.confidence).toBe("high");
    expect(out.findings.find((f) => f.refs[0] === "mid")!.confidence).toBe("medium");
  });

  it("ignores income and transfers", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          ...history(10, 10, "h"),
          tx({ id: "pay", amount: 5000, title: "Salary", category: "food" }),
          tx({ id: "mv", amount: -5000, title: "Move", category: "food", transferId: "z" }),
        ],
      }),
    );
    const out = r.groups.find((g) => g.kind === "outlier");
    expect(out?.findings.some((f) => ["pay", "mv"].includes(f.refs[0]!))).not.toBe(true);
  });

  it("scales with currency: converted amounts produce the same relative findings", () => {
    const usd = scanDataHealth(base({ transactions: [...history(10, 10, "h"), tx({ id: "big", amount: -400 })] }));
    const eur = scanDataHealth(
      base({
        transactions: [...history(10, 9.2, "h"), tx({ id: "big", amount: -368 })],
      }),
    );
    const a = usd.groups.find((g) => g.kind === "outlier")!.findings[0]!;
    const b = eur.groups.find((g) => g.kind === "outlier")!.findings[0]!;
    expect(b.refs).toEqual(a.refs);
    expect(b.reasonParams!.times).toBe(a.reasonParams!.times);
    expect(b.amount).toBeLessThan(a.amount!);
  });
});

describe("schedules and references", () => {
  const rec = (o: Partial<Recurring> & { id: string }): Recurring =>
    ({ title: "Rent", category: "home", amount: -900, accountId: "a1", frequency: "monthly", nextDate: iso(5), ...o }) as Recurring;
  const sub = (o: Partial<Subscription> & { id: string }): Subscription =>
    ({ name: "Netflix", amount: 15, category: "fun", nextDate: iso(5), color: "", emoji: "", accountId: "a1", status: "active", ...o }) as Subscription;

  it("flags recurring items and subscriptions pointing at a deleted account", () => {
    const r = scanDataHealth(
      base({ recurring: [rec({ id: "r1", accountId: "gone" })], subscriptions: [sub({ id: "s1", accountId: "gone" })] }),
    );
    const g = r.groups.find((g) => g.kind === "orphan_ref")!;
    expect(g.findings.map((f) => f.link).sort()).toEqual(["/automation", "/subscriptions"]);
  });

  it("does not flag a subscription with no account linked at all", () => {
    const r = scanDataHealth(base({ subscriptions: [sub({ id: "s1", accountId: undefined })] }));
    expect(r.groups.some((g) => g.kind === "orphan_ref")).toBe(false);
  });

  it("flags overdue schedules only past the grace period and skips paused subscriptions", () => {
    const r = scanDataHealth(
      base({
        recurring: [rec({ id: "r1", nextDate: iso(-90) }), rec({ id: "r2", nextDate: iso(-3) })],
        subscriptions: [sub({ id: "s1", nextDate: iso(-40) }), sub({ id: "s2", nextDate: iso(-40), status: "paused" })],
      }),
    );
    const g = r.groups.find((g) => g.kind === "stale_schedule")!;
    expect(g.findings.map((f) => f.refs[0])).toEqual(["r1", "s1"]);
    expect(g.findings[0]!.confidence).toBe("high");
    expect(g.findings[1]!.confidence).toBe("medium");
  });
});

describe("malformed input", () => {
  it("skips unreadable rows instead of crashing or inventing findings", () => {
    const r = scanDataHealth(
      base({
        transactions: [
          tx({ id: "ok" }),
          tx({ id: "nan", amount: Number.NaN }),
          tx({ id: "inf", amount: Number.POSITIVE_INFINITY }),
          tx({ id: "huge", amount: 1e15 }),
          tx({ id: "baddate", date: "not-a-date" }),
          { id: "", title: "x" } as unknown as Transaction,
          null as unknown as Transaction,
        ],
      }),
    );
    expect(r.scanned.transactions).toBe(1);
    expect(r.skipped).toBe(6);
    for (const g of r.groups) for (const f of g.findings) {
      if (f.amount !== undefined) expect(Number.isFinite(f.amount)).toBe(true);
    }
  });

  it("tolerates missing arrays and an invalid clock", () => {
    const r = scanDataHealth({ now: Number.NaN } as HealthInput);
    expect(r.total).toBe(0);
    expect(Number.isFinite(r.ranAt)).toBe(true);
    expect(r.groups).toEqual([]);
  });

  it("returns groups in the documented order", () => {
    const r = scanDataHealth(
      base({
        transactions: [tx({ id: "t1", title: "" }), tx({ id: "t2", category: "other" })],
      }),
    );
    const order = r.groups.map((g) => g.kind);
    expect(order).toEqual(HEALTH_KINDS.filter((k) => order.includes(k)));
  });
});

describe("read-only invariants", () => {
  it("never mutates the input snapshot", () => {
    const txs = [
      tx({ id: "t1", amount: -24.5, title: "LIDL" }),
      tx({ id: "t2", amount: -24.5, title: "LIDL" }),
      tx({ id: "t3", title: "", category: "other" }),
    ];
    const recurring: Recurring[] = [
      { id: "r1", title: "Rent", category: "home", amount: -900, accountId: "gone", frequency: "monthly", nextDate: iso(-90) } as Recurring,
    ];
    const accounts = [acc("a1")];
    const before = JSON.stringify({ txs, recurring, accounts });
    const r = scanDataHealth({ transactions: txs, recurring, accounts, subscriptions: [], categoryIds: ["food"], now: NOW });
    expect(r.total).toBeGreaterThan(0);
    expect(JSON.stringify({ txs, recurring, accounts })).toBe(before);
  });

  it("is deterministic: the same snapshot yields the same findings", () => {
    const input = base({
      transactions: [tx({ id: "t1", amount: -12, title: "Uber" }), tx({ id: "t2", amount: -12, title: "Uber" })],
    });
    const a = scanDataHealth(input);
    const b = scanDataHealth(input);
    expect(JSON.stringify(a.groups)).toBe(JSON.stringify(b.groups));
  });

  it("produces only links to existing read-only surfaces", () => {
    const r = scanDataHealth(
      base({
        transactions: [tx({ id: "t1", title: "" })],
        recurring: [{ id: "r1", title: "X", category: "home", amount: -1, accountId: "gone", frequency: "monthly", nextDate: iso(-90) } as Recurring],
      }),
    );
    const allowed = new Set(["/wallet", "/automation", "/subscriptions", "/categories"]);
    for (const g of r.groups) for (const f of g.findings) expect(allowed.has(f.link)).toBe(true);
  });
});

describe("findOutliers guards", () => {
  it("returns nothing when the median is zero", () => {
    const rows = cleanRows(Array.from({ length: 10 }, (_, i) => tx({ id: `z${i}`, amount: -0 })));
    expect(findOutliers(rows)).toEqual([]);
  });
});
