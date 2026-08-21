import { describe, it, expect } from "vitest";
import {
  buildPreview,
  summarize,
  toTransactions,
  outcomeOf,
  isSelected,
  type RawImportRow,
  type ExistingTx,
} from "./import-preview";
import { parseBankCsvRaw } from "./csv-import";
import { runIntegrityChecks } from "./integrity";
import type { NovaState } from "./nova-store";
import type { CategoryRule } from "./category-rules";

const NOW = Date.UTC(2026, 6, 20, 12);

const row = (over: Partial<RawImportRow> & { line?: number }): RawImportRow => ({
  line: 2,
  date: "2026-07-18",
  title: "LIDL BG #4921",
  amount: "-24.50",
  ...over,
});

const existing = (over: Partial<ExistingTx>): ExistingTx => ({
  title: "LIDL 1248 SOFIA",
  amount: -24.5,
  date: "2026-07-18T12:00:00.000Z",
  accountId: "a1",
  currency: "USD",
  ...over,
});

const base = {
  accountId: "a1",
  accountCurrency: "USD" as const,
  existing: [] as ExistingTx[],
  now: NOW,
};

describe("import preview — duplicates", () => {
  it("flags an exact duplicate (same day, amount, merchant, account)", () => {
    const [r] = buildPreview([row({})], { ...base, existing: [existing({})] });
    expect(r.dupe).toBe("exact");
    expect(r.defaultSelected).toBe(false);
  });

  it("flags a likely duplicate within the 3-day window", () => {
    const [r] = buildPreview([row({})], {
      ...base,
      existing: [existing({ date: "2026-07-20T12:00:00.000Z" })],
    });
    expect(r.dupe).toBe("likely");
    expect(r.needsReview).toBe(true);
    expect(r.defaultSelected).toBe(false);
  });

  it("same amount but different merchant is not a duplicate", () => {
    const [r] = buildPreview([row({ title: "Shell Gas Station" })], {
      ...base,
      existing: [existing({})],
    });
    expect(r.dupe).toBe("none");
    expect(r.defaultSelected).toBe(true);
  });

  it("same merchant but distant date is not a duplicate", () => {
    const [r] = buildPreview([row({})], {
      ...base,
      existing: [existing({ date: "2026-06-18T12:00:00.000Z" })],
    });
    expect(r.dupe).toBe("none");
  });

  it("detects duplicates inside the same file", () => {
    const rows = buildPreview([row({}), row({ line: 3 })], base);
    expect(rows[0].dupe).toBe("none");
    expect(rows[1].dupe).toBe("exact");
  });
});

describe("import preview — validation", () => {
  it("rejects an invalid date", () => {
    const [r] = buildPreview([row({ date: "31/31/2026" })], base);
    expect(r.issues).toContain("dateInvalid");
    expect(r.valid).toBe(false);
    expect(isSelected(r, { 0: true })).toBe(false);
  });

  it("rejects invalid, zero and missing amounts", () => {
    const rows = buildPreview(
      [row({ amount: "abc" }), row({ amount: "0" }), row({ amount: "" })],
      base,
    );
    expect(rows[0].issues).toContain("amountInvalid");
    expect(rows[1].issues).toContain("amountZero");
    expect(rows[2].issues).toContain("amountMissing");
    expect(rows.every((r) => !r.valid)).toBe(true);
  });

  it("marks suspicious future dates for review but keeps them fixable", () => {
    const [r] = buildPreview([row({ date: "2027-01-01" })], base);
    expect(r.issues).toContain("dateFuture");
    expect(r.needsReview).toBe(true);
  });
});

describe("import preview — currency", () => {
  it("blocks a cross-currency row by default", () => {
    const [r] = buildPreview([row({ currency: "EUR" })], base);
    expect(r.issues).toContain("currencyMismatch");
    expect(r.valid).toBe(false);
  });

  it("converts exactly once when the user opts in", () => {
    const [r] = buildPreview([row({ currency: "EUR" })], {
      ...base,
      crossCurrency: "convert",
    });
    expect(r.valid).toBe(true);
    expect(r.converted).toBe(true);
    expect(r.currency).toBe("USD");
    expect(r.sourceCurrency).toBe("EUR");
    expect(r.amount).not.toBe(r.sourceAmount);
    expect(toTransactions([r])[0].currency).toBe("USD");
  });
});

describe("import preview — categories", () => {
  const rules: CategoryRule[] = [
    {
      id: "r1",
      name: "Lidl → food",
      field: "merchant",
      operator: "contains",
      value: "lidl",
      categoryId: "food",
      enabled: true,
      priority: 1,
    },
  ];

  it("previews the smart rule category without mutating rules", () => {
    const snapshot = JSON.stringify(rules);
    const [r] = buildPreview([row({})], { ...base, rules });
    expect(r.category).toBe("food");
    expect(r.categorySource).toBe("rule");
    expect(JSON.stringify(rules)).toBe(snapshot);
  });

  it("manual override wins and locks the category", () => {
    const [r] = buildPreview([row({})], {
      ...base,
      rules,
      categoryOverrides: { 0: "shopping" },
    });
    expect(r.category).toBe("shopping");
    expect(r.categorySource).toBe("manual");
    expect(toTransactions([r])[0].categoryLocked).toBe(true);
  });
});

describe("import preview — selection & outcome", () => {
  const rows = () =>
    buildPreview(
      [
        row({}),
        row({ line: 3, title: "Shell Gas", amount: "-40" }),
        row({ line: 4, amount: "bad" }),
      ],
      { ...base, existing: [existing({})] },
    );

  it("skips duplicates and invalid rows by default", () => {
    const rs = rows();
    const txs = toTransactions(rs);
    expect(txs).toHaveLength(1);
    expect(txs[0].title).toBe("Shell Gas");
    const o = outcomeOf(rs);
    expect(o).toEqual({
      imported: 1,
      skippedDuplicates: 1,
      skippedInvalid: 1,
      excluded: 0,
    });
  });

  it("imports only the rows the user selected", () => {
    const rs = rows();
    const sel = { 0: true, 1: false };
    const txs = toTransactions(rs, sel);
    expect(txs).toHaveLength(1);
    expect(txs[0].category).toBeDefined();
    expect(summarize(rs, sel).selected).toBe(1);
    expect(outcomeOf(rs, sel).excluded).toBe(1);
  });

  it("summarises totals for the preview header", () => {
    const s = summarize(rows());
    expect(s.total).toBe(3);
    expect(s.valid).toBe(2);
    expect(s.invalid).toBe(1);
    expect(s.exactDuplicates).toBe(1);
  });
});

describe("import preview — end to end", () => {
  it("parses a CSV and imports cleanly with no integrity issues", () => {
    const csv = [
      "date,description,amount,currency",
      "2026-07-18,LIDL BG #4921,-24.50,USD",
      "2026-07-17,Salary Acme,3200.00,USD",
      "not-a-date,Broken row,-10,USD",
    ].join("\n");
    const parsed = parseBankCsvRaw(csv);
    expect(parsed.rows).toHaveLength(3);
    const rows = buildPreview(parsed.rows, base);
    const txs = toTransactions(rows);
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => !t.transferId && !("kind" in t))).toBe(true);

    const state = {
      accounts: [{ id: "a1", name: "Bank", balance: 100, currency: "USD" }],
      transactions: txs.map((t, i) => ({ ...t, id: `t${i}` })),
      categories: [],
      goals: [],
      budgets: [],
      recurring: [],
      liabilities: [],
      subscriptions: [],
      automationRules: [],
      categoryRules: [],
    } as unknown as NovaState;
    const issues = runIntegrityChecks(state).filter((i) => i.severity === "critical");
    expect(issues).toHaveLength(0);
  });
});
