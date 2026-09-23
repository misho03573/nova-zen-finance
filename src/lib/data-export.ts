/**
 * NOVA Data Export Center — pure, local-only export builders.
 *
 * Hard rules encoded here (covered by `__export.test.ts`):
 *  - No network, no storage, no AI. Every function is a pure transform of the
 *    state object it is handed; nothing is retained between calls.
 *  - Security material (PIN hash, lock/biometric configuration, recovery
 *    hints) is NEVER eligible for export.
 *  - Internal-only presentation fields (gradients, brand art, colors, icon
 *    keys, rule-lock flags) are stripped — the archive is user data, not app
 *    internals.
 *  - Every CSV cell is escaped and de-fanged against spreadsheet formula
 *    injection.
 *  - Malformed rows (non-finite amounts, unreadable dates, non-objects) are
 *    skipped and counted rather than exported as garbage.
 */
import type { CurrencyCode } from "@/lib/currency";
import type {
  Account,
  Budget,
  Goal,
  Liability,
  NovaState,
  Recurring,
  Settings,
  Subscription,
  Transaction,
} from "@/lib/nova-store";

export const EXPORT_FORMAT_VERSION = 1;

export const EXPORT_SECTIONS = [
  "transactions",
  "accounts",
  "recurring",
  "subscriptions",
  "goals",
  "budgets",
  "liabilities",
  "categories",
  "preferences",
] as const;

export type ExportSection = (typeof EXPORT_SECTIONS)[number];

/** Sections that make sense as a flat, human-readable spreadsheet. */
export const CSV_SECTIONS: ExportSection[] = [
  "transactions",
  "accounts",
  "recurring",
  "subscriptions",
  "goals",
  "budgets",
  "liabilities",
  "categories",
];

/**
 * Settings keys that must never leave the device. Kept as an explicit
 * allow-deny list so a new secret field fails the redaction test loudly.
 */
export const SECRET_SETTINGS_KEYS = [
  "pin",
  "pinEnabled",
  "biometric",
  "faceId",
  "touchId",
  "autoLockMinutes",
] as const;

const VALID_CURRENCIES: CurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "INR",
  "BRL",
  "BGN",
];

const MAX_ABS_AMOUNT = 1e12;

/* ------------------------------------------------------------------ */
/* sanitizers                                                          */
/* ------------------------------------------------------------------ */

/** Finite, in-range money value, or `null` when the record is unusable. */
export function safeAmount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (Math.abs(v) > MAX_ABS_AMOUNT) return null;
  return v;
}

/** ISO-8601 date string, or `null` when unreadable. */
export function safeDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** A known currency code, or the supplied fallback. */
export function safeCurrency(v: unknown, fallback: CurrencyCode = "USD"): CurrencyCode {
  return VALID_CURRENCIES.includes(v as CurrencyCode) ? (v as CurrencyCode) : fallback;
}

/** Single-line, control-character-free text. */
export function safeText(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/**
 * Filename hardening: no path separators, no traversal, no control
 * characters, no leading dots, bounded length, always suffixed.
 */
export function safeFilename(base: string, ext: "csv" | "json"): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "")
    .slice(0, 80);
  return `${cleaned || "nova-export"}.${ext}`;
}

/**
 * Neutralises spreadsheet formula injection. Excel/Sheets/Numbers execute a
 * cell beginning with = + - @ or a leading tab/CR, so those values are
 * prefixed with an apostrophe before quoting.
 */
export function csvCell(v: unknown): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (typeof v === "number") s = Number.isFinite(v) ? String(v) : "";
  else if (typeof v === "boolean") s = v ? "true" : "false";
  else s = String(v);

  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");

  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/["\n,;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Joins rows into an RFC4180 document with a UTF-8 friendly CRLF ending. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* redaction                                                           */
/* ------------------------------------------------------------------ */

/** Preferences with every security/recovery field removed. */
export function redactSettings(settings: Settings | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!settings || typeof settings !== "object") return out;
  const secret = new Set<string>(SECRET_SETTINGS_KEYS);
  for (const [k, v] of Object.entries(settings)) {
    if (secret.has(k)) continue;
    if (typeof v === "function" || typeof v === "symbol") continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* row builders (shared by CSV and JSON so both stay identical)        */
/* ------------------------------------------------------------------ */

export type SectionRows = { rows: Record<string, unknown>[]; skipped: number };

function isRow(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function accountCurrencyMap(accounts: unknown): Map<string, CurrencyCode> {
  const m = new Map<string, CurrencyCode>();
  for (const a of list(accounts)) {
    if (!isRow(a) || typeof a.id !== "string") continue;
    m.set(a.id, safeCurrency(a.currency));
  }
  return m;
}

function buildTransactions(state: Partial<NovaState>): SectionRows {
  const cur = accountCurrencyMap(state.accounts);
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.transactions)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const t = raw as Partial<Transaction>;
    const amount = safeAmount(t.amount);
    const date = safeDate(t.date);
    if (amount === null || date === null || typeof t.id !== "string") {
      skipped += 1;
      continue;
    }
    rows.push({
      id: t.id,
      date,
      title: safeText(t.title),
      category: safeText(t.category, 80),
      amount,
      currency: safeCurrency(t.currency, cur.get(String(t.accountId)) ?? "USD"),
      accountId: safeText(t.accountId, 80),
      type: t.kind === "adjustment" ? "adjustment" : t.transferId ? "transfer" : amount < 0 ? "expense" : "income",
      note: safeText(t.note),
    });
  }
  return { rows, skipped };
}

function buildAccounts(state: Partial<NovaState>): SectionRows {
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.accounts)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const a = raw as Partial<Account>;
    const balance = safeAmount(a.balance);
    if (balance === null || typeof a.id !== "string") {
      skipped += 1;
      continue;
    }
    // `number`, `gradient` and `brand` are deliberately omitted: card digits
    // are sensitive, the other two are presentation internals.
    rows.push({
      id: a.id,
      name: safeText(a.name, 120),
      type: safeText(a.type, 40),
      balance,
      currency: safeCurrency(a.currency),
    });
  }
  return { rows, skipped };
}

function buildRecurring(state: Partial<NovaState>): SectionRows {
  const cur = accountCurrencyMap(state.accounts);
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.recurring)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const r = raw as Partial<Recurring>;
    const amount = safeAmount(r.amount);
    const next = safeDate(r.nextDate);
    if (amount === null || next === null || typeof r.id !== "string") {
      skipped += 1;
      continue;
    }
    rows.push({
      id: r.id,
      title: safeText(r.title),
      category: safeText(r.category, 80),
      amount,
      currency: safeCurrency(r.currency, cur.get(String(r.accountId)) ?? "USD"),
      frequency: safeText(r.frequency, 20),
      nextDate: next,
      accountId: safeText(r.accountId, 80),
      note: safeText(r.note),
    });
  }
  return { rows, skipped };
}

function buildSubscriptions(state: Partial<NovaState>): SectionRows {
  const cur = accountCurrencyMap(state.accounts);
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.subscriptions)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const s = raw as Partial<Subscription>;
    const amount = safeAmount(s.amount);
    const next = safeDate(s.nextDate);
    if (amount === null || next === null || typeof s.id !== "string") {
      skipped += 1;
      continue;
    }
    rows.push({
      id: s.id,
      name: safeText(s.name, 120),
      merchant: safeText(s.merchant, 120),
      category: safeText(s.category, 80),
      amount,
      currency: safeCurrency(s.currency, cur.get(String(s.accountId)) ?? "USD"),
      frequency: safeText(s.frequency, 20),
      status: safeText(s.status, 20) || "active",
      nextDate: next,
      accountId: safeText(s.accountId, 80),
      notes: safeText(s.notes),
    });
  }
  return { rows, skipped };
}

function buildGoals(state: Partial<NovaState>): SectionRows {
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.goals)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const g = raw as Partial<Goal>;
    const saved = safeAmount(g.saved);
    const target = safeAmount(g.target);
    if (saved === null || target === null || typeof g.id !== "string") {
      skipped += 1;
      continue;
    }
    rows.push({
      id: g.id,
      name: safeText(g.name, 120),
      saved,
      target,
      currency: safeCurrency(g.currency),
      monthly: safeAmount(g.monthly) ?? "",
      accountId: safeText(g.accountId, 80),
    });
  }
  return { rows, skipped };
}

function buildBudgets(state: Partial<NovaState>): SectionRows {
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.budgets)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const b = raw as Partial<Budget>;
    const limit = safeAmount(b.limit);
    if (limit === null || typeof b.id !== "string") {
      skipped += 1;
      continue;
    }
    rows.push({
      id: b.id,
      category: safeText(b.category, 80),
      limit,
      currency: safeCurrency(b.currency),
    });
  }
  return { rows, skipped };
}

function buildLiabilities(state: Partial<NovaState>): SectionRows {
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.liabilities)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    const l = raw as Partial<Liability>;
    const balance = safeAmount(l.balance);
    if (balance === null || typeof l.id !== "string") {
      skipped += 1;
      continue;
    }
    rows.push({
      id: l.id,
      name: safeText(l.name, 120),
      type: safeText(l.type, 40),
      balance,
      currency: safeCurrency(l.currency),
      apr: safeAmount(l.apr) ?? "",
      minPayment: safeAmount(l.minPayment) ?? "",
    });
  }
  return { rows, skipped };
}

function buildCategories(state: Partial<NovaState>): SectionRows {
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of list(state.categories)) {
    if (!isRow(raw)) {
      skipped += 1;
      continue;
    }
    if (typeof raw.id !== "string") {
      skipped += 1;
      continue;
    }
    // `icon` and `color` are app presentation internals.
    rows.push({
      id: raw.id,
      name: safeText(raw.name, 120),
      type: safeText(raw.type, 40),
      builtin: raw.builtin === true,
    });
  }
  return { rows, skipped };
}

const BUILDERS: Record<Exclude<ExportSection, "preferences">, (s: Partial<NovaState>) => SectionRows> = {
  transactions: buildTransactions,
  accounts: buildAccounts,
  recurring: buildRecurring,
  subscriptions: buildSubscriptions,
  goals: buildGoals,
  budgets: buildBudgets,
  liabilities: buildLiabilities,
  categories: buildCategories,
};

/** Sanitised rows for one section (`preferences` has no tabular rows). */
export function sectionRows(state: Partial<NovaState>, section: ExportSection): SectionRows {
  if (section === "preferences") return { rows: [], skipped: 0 };
  return BUILDERS[section](state ?? {});
}

/** How many exportable records each section currently holds. */
export function sectionCounts(state: Partial<NovaState>): Record<ExportSection, number> {
  const out = {} as Record<ExportSection, number>;
  for (const s of EXPORT_SECTIONS) {
    out[s] = s === "preferences" ? Object.keys(redactSettings(state?.settings)).length : sectionRows(state, s).rows.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* file builders                                                       */
/* ------------------------------------------------------------------ */

export type ExportFile = { name: string; mime: string; content: string; section?: ExportSection };

function headerFor(rows: Record<string, unknown>[], section: ExportSection): string[] {
  if (rows.length > 0) return Object.keys(rows[0]);
  // Stable empty-file headers so an empty export is still a valid CSV.
  const sample = sectionRows(
    { [section]: [] } as Partial<NovaState>,
    section,
  );
  void sample;
  return EMPTY_HEADERS[section] ?? [];
}

const EMPTY_HEADERS: Partial<Record<ExportSection, string[]>> = {
  transactions: ["id", "date", "title", "category", "amount", "currency", "accountId", "type", "note"],
  accounts: ["id", "name", "type", "balance", "currency"],
  recurring: ["id", "title", "category", "amount", "currency", "frequency", "nextDate", "accountId", "note"],
  subscriptions: [
    "id",
    "name",
    "merchant",
    "category",
    "amount",
    "currency",
    "frequency",
    "status",
    "nextDate",
    "accountId",
    "notes",
  ],
  goals: ["id", "name", "saved", "target", "currency", "monthly", "accountId"],
  budgets: ["id", "category", "limit", "currency"],
  liabilities: ["id", "name", "type", "balance", "currency", "apr", "minPayment"],
  categories: ["id", "name", "type", "builtin"],
};

export type BuildOptions = {
  sections: ExportSection[];
  /** Injected for deterministic filenames/tests. */
  now?: Date;
};

function stamp(now: Date): string {
  const d = Number.isFinite(now?.getTime?.()) ? now : new Date(0);
  return d.toISOString().slice(0, 10);
}

/** One CSV per selected tabular section. Nothing is written or sent anywhere. */
export function buildCsvFiles(state: Partial<NovaState>, opts: BuildOptions): ExportFile[] {
  const day = stamp(opts.now ?? new Date());
  const files: ExportFile[] = [];
  for (const section of EXPORT_SECTIONS) {
    if (!opts.sections.includes(section)) continue;
    if (!CSV_SECTIONS.includes(section)) continue;
    const { rows } = sectionRows(state, section);
    files.push({
      section,
      name: safeFilename(`nova-${section}-${day}`, "csv"),
      mime: "text/csv;charset=utf-8",
      content: toCsv(headerFor(rows, section), rows.map((r) => Object.values(r))),
    });
  }
  return files;
}

export type JsonArchive = {
  app: "NOVA";
  formatVersion: number;
  exportedAt: string;
  sections: ExportSection[];
  skipped: number;
  data: Partial<Record<ExportSection, unknown>>;
};

/** A single structured archive of exactly the selected sections. */
export function buildJsonArchive(state: Partial<NovaState>, opts: BuildOptions): { file: ExportFile; archive: JsonArchive } {
  const now = opts.now ?? new Date();
  const data: Partial<Record<ExportSection, unknown>> = {};
  let skipped = 0;
  const chosen = EXPORT_SECTIONS.filter((s) => opts.sections.includes(s));

  for (const section of chosen) {
    if (section === "preferences") {
      data.preferences = redactSettings(state?.settings);
      continue;
    }
    const res = sectionRows(state, section);
    skipped += res.skipped;
    data[section] = res.rows;
  }

  const archive: JsonArchive = {
    app: "NOVA",
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString(),
    sections: chosen,
    skipped,
    data,
  };

  return {
    archive,
    file: {
      name: safeFilename(`nova-export-${stamp(now)}`, "json"),
      mime: "application/json",
      content: JSON.stringify(archive, null, 2),
    },
  };
}

/** Total skipped (unreadable) records across the selected sections. */
export function countSkipped(state: Partial<NovaState>, sections: ExportSection[]): number {
  let n = 0;
  for (const s of sections) {
    if (s === "preferences") continue;
    n += sectionRows(state, s).skipped;
  }
  return n;
}
