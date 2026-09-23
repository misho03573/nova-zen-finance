import { describe, expect, it, vi } from "vitest";
import {
  buildCsvFiles,
  buildJsonArchive,
  countSkipped,
  csvCell,
  redactSettings,
  safeAmount,
  safeCurrency,
  safeDate,
  safeFilename,
  sectionCounts,
  sectionRows,
  SECRET_SETTINGS_KEYS,
  toCsv,
  type ExportSection,
} from "@/lib/data-export";
import type { NovaState } from "@/lib/nova-store";

const NOW = new Date("2026-03-04T10:00:00.000Z");

function state(over: Partial<NovaState> = {}): Partial<NovaState> {
  return {
    accounts: [
      { id: "a1", name: "Main", number: "4242 4242", holder: "Me", balance: 100, gradient: "g", brand: "visa", type: "bank", currency: "EUR" },
    ],
    transactions: [
      { id: "t1", title: "Lidl", category: "food", amount: -20, date: "2026-03-01T09:00:00.000Z", accountId: "a1", categoryLocked: true },
    ],
    recurring: [
      { id: "r1", title: "Rent", category: "home", amount: -500, accountId: "a1", frequency: "monthly", nextDate: "2026-04-01T09:00:00.000Z" },
    ],
    subscriptions: [
      { id: "s1", name: "Netflix", amount: 12, category: "fun", nextDate: "2026-04-02T09:00:00.000Z", color: "#fff", emoji: "🎬", accountId: "a1" },
    ],
    goals: [{ id: "g1", name: "Trip", saved: 50, target: 500, emoji: "✈️", eta: "" }],
    budgets: [{ id: "b1", category: "food", limit: 300, currency: "EUR" }],
    liabilities: [{ id: "l1", name: "Card", type: "credit_card", balance: 200, currency: "EUR" }],
    categories: [{ id: "food", name: "Food", icon: "utensils", color: "#0f0", type: "expense", builtin: true }],
    settings: {
      notifications: true,
      biometric: true,
      budgetAlerts: true,
      pinEnabled: true,
      pin: "pbkdf2$secret$hash",
      faceId: true,
      touchId: true,
      autoLockMinutes: 5,
      language: "bg",
      accent: "#00D084",
      hideBalances: false,
    },
    ...over,
  };
}

const ALL = [
  "transactions",
  "accounts",
  "recurring",
  "subscriptions",
  "goals",
  "budgets",
  "liabilities",
  "categories",
  "preferences",
] as ExportSection[];

describe("redaction", () => {
  it("never exports security or recovery material", () => {
    const prefs = redactSettings(state().settings);
    for (const k of SECRET_SETTINGS_KEYS) expect(prefs).not.toHaveProperty(k);
    expect(prefs.language).toBe("bg");
    expect(prefs.accent).toBe("#00D084");
  });

  it("keeps the PIN hash out of the JSON archive entirely", () => {
    const { file } = buildJsonArchive(state(), { sections: ALL, now: NOW });
    expect(file.content).not.toContain("pbkdf2");
    expect(file.content).not.toContain("pinEnabled");
    expect(file.content).not.toContain("autoLockMinutes");
  });

  it("strips card numbers and presentation internals from accounts", () => {
    const { rows } = sectionRows(state(), "accounts");
    expect(rows[0]).toEqual({ id: "a1", name: "Main", type: "bank", balance: 100, currency: "EUR" });
    const { file } = buildJsonArchive(state(), { sections: ALL, now: NOW });
    expect(file.content).not.toContain("4242");
    expect(file.content).not.toContain("gradient");
    expect(file.content).not.toContain("categoryLocked");
  });

  it("tolerates missing settings", () => {
    expect(redactSettings(undefined)).toEqual({});
  });
});

describe("scoped selection", () => {
  it("exports only the chosen sections", () => {
    const { archive } = buildJsonArchive(state(), { sections: ["goals", "budgets"], now: NOW });
    expect(Object.keys(archive.data).sort()).toEqual(["budgets", "goals"]);
    expect(archive.sections).toEqual(["goals", "budgets"]);
  });

  it("writes one CSV per selected tabular section and skips preferences", () => {
    const files = buildCsvFiles(state(), { sections: ["transactions", "preferences"], now: NOW });
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("nova-transactions-2026-03-04.csv");
  });

  it("produces nothing when nothing is selected", () => {
    expect(buildCsvFiles(state(), { sections: [], now: NOW })).toEqual([]);
    const { archive } = buildJsonArchive(state(), { sections: [], now: NOW });
    expect(archive.data).toEqual({});
  });

  it("counts records per section", () => {
    const counts = sectionCounts(state());
    expect(counts.transactions).toBe(1);
    expect(counts.accounts).toBe(1);
    expect(counts.preferences).toBeGreaterThan(0);
  });
});

describe("CSV escaping and formula-injection safety", () => {
  it("neutralises formula prefixes", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@import")).toBe("'@import");
    expect(csvCell("\tTAB")).toBe("'\tTAB");
  });

  it("quotes separators, quotes and newlines", () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("keeps negative numbers numeric, not quoted as formulas", () => {
    expect(csvCell(-20)).toBe("'-20");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("true");
  });

  it("escapes malicious merchant names inside a real export", () => {
    const evil = state({
      transactions: [
        {
          id: "t1",
          title: '=HYPERLINK("http://evil","click"),x',
          category: "food",
          amount: -1,
          date: "2026-03-01T09:00:00.000Z",
          accountId: "a1",
        },
      ],
    });
    const [csv] = buildCsvFiles(evil, { sections: ["transactions"], now: NOW });
    expect(csv.content).toContain('"\'=HYPERLINK(""http://evil"",""click""),x"');
    expect(csv.content).not.toMatch(/,=HYPERLINK/);
  });

  it("emits a header row even with no data", () => {
    const [csv] = buildCsvFiles({ transactions: [] }, { sections: ["transactions"], now: NOW });
    expect(csv.content.split("\r\n")[0]).toBe("id,date,title,category,amount,currency,accountId,type,note");
  });

  it("builds RFC4180 rows", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("sanitisers", () => {
  it("rejects non-finite and absurd amounts", () => {
    expect(safeAmount(Number.NaN)).toBeNull();
    expect(safeAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(safeAmount(1e13)).toBeNull();
    expect(safeAmount("12" as unknown)).toBeNull();
    expect(safeAmount(-12.5)).toBe(-12.5);
  });

  it("rejects unreadable dates", () => {
    expect(safeDate("not-a-date")).toBeNull();
    expect(safeDate("")).toBeNull();
    expect(safeDate(undefined)).toBeNull();
    expect(safeDate("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
  });

  it("falls back to a known currency", () => {
    expect(safeCurrency("XYZ")).toBe("USD");
    expect(safeCurrency(undefined, "EUR")).toBe("EUR");
    expect(safeCurrency("BGN")).toBe("BGN");
  });

  it("hardens filenames", () => {
    expect(safeFilename("../../etc/passwd", "json")).toBe("etc-passwd.json");
    expect(safeFilename("", "csv")).toBe("nova-export.csv");
    expect(safeFilename("nova export 2026", "csv")).toBe("nova-export-2026.csv");
    expect(safeFilename("a".repeat(200), "json")).toBe(`${"a".repeat(80)}.json`);
  });
});

describe("malformed and empty data", () => {
  it("skips unreadable records instead of exporting garbage", () => {
    const broken = state({
      transactions: [
        { id: "ok", title: "Good", category: "food", amount: -5, date: "2026-03-01T09:00:00.000Z", accountId: "a1" },
        { id: "bad1", title: "NaN", category: "food", amount: Number.NaN, date: "2026-03-01T09:00:00.000Z", accountId: "a1" },
        { id: "bad2", title: "Date", category: "food", amount: -5, date: "nope", accountId: "a1" },
        null as never,
      ],
    });
    const res = sectionRows(broken, "transactions");
    expect(res.rows).toHaveLength(1);
    expect(res.skipped).toBe(3);
    expect(countSkipped(broken, ["transactions", "preferences"])).toBe(3);
    const { archive } = buildJsonArchive(broken, { sections: ["transactions"], now: NOW });
    expect(archive.skipped).toBe(3);
  });

  it("survives completely empty or missing state", () => {
    const { archive, file } = buildJsonArchive({}, { sections: ALL, now: NOW });
    expect(archive.data.transactions).toEqual([]);
    expect(archive.data.preferences).toEqual({});
    expect(() => JSON.parse(file.content)).not.toThrow();
    const files = buildCsvFiles({}, { sections: ALL, now: NOW });
    expect(files).toHaveLength(8);
    for (const f of files) expect(f.content.endsWith("\r\n")).toBe(true);
  });

  it("uses the account currency when a transaction has none", () => {
    const { rows } = sectionRows(state(), "transactions");
    expect(rows[0].currency).toBe("EUR");
  });

  it("labels transfers and adjustments", () => {
    const s = state({
      transactions: [
        { id: "t1", title: "Move", category: "transfer", amount: -10, date: "2026-03-01T09:00:00.000Z", accountId: "a1", transferId: "x" },
        { id: "t2", title: "Fix", category: "adjustment", amount: 5, date: "2026-03-01T09:00:00.000Z", accountId: "a1", kind: "adjustment" },
      ],
    });
    const { rows } = sectionRows(s, "transactions");
    expect(rows[0].type).toBe("transfer");
    expect(rows[1].type).toBe("adjustment");
  });
});

describe("no-network / no-persist invariants", () => {
  it("does not touch fetch, storage or the input state", () => {
    const fetchSpy = vi.fn();
    const g = globalThis as unknown as Record<string, unknown>;
    const originalFetch = g.fetch;
    g.fetch = fetchSpy;
    const setItem = vi.fn();
    g.localStorage = { setItem, getItem: () => null, removeItem: vi.fn() };

    const input = state();
    const snapshot = JSON.stringify(input);
    buildJsonArchive(input, { sections: ALL, now: NOW });
    buildCsvFiles(input, { sections: ALL, now: NOW });
    sectionCounts(input);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(input)).toBe(snapshot);

    g.fetch = originalFetch;
    delete g.localStorage;
  });

  it("is deterministic for the same state and timestamp", () => {
    const a = buildJsonArchive(state(), { sections: ALL, now: NOW }).file.content;
    const b = buildJsonArchive(state(), { sections: ALL, now: NOW }).file.content;
    expect(a).toBe(b);
  });
});
