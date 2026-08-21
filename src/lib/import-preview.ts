/**
 * Import preview pipeline (Phase 6).
 *
 * Pure, deterministic layer that turns raw CSV cells into reviewable rows.
 * Nothing here mutates the store: the UI renders the preview, the user
 * confirms, and only then `toTransactions()` produces store payloads.
 *
 * Guarantees:
 *  - invalid rows can never be imported
 *  - duplicates are detected, never deleted or overwritten
 *  - the raw descriptor is preserved next to the normalized merchant label
 *  - a cross-currency row is either converted exactly once or blocked
 *  - imported rows are always plain income/expense — never adjustments or
 *    transfer legs
 */

import { convertAmount, type CurrencyCode, CURRENCIES } from "@/lib/currency";
import { resolveMerchant, type MerchantAlias } from "@/lib/merchant";
import { resolveRuleCategory, type CategoryRule } from "@/lib/category-rules";
import { parseAmount, parseDate } from "@/lib/csv-import";
import type { Transaction } from "@/lib/nova-store";

export type RawImportRow = {
  line: number;
  date: string;
  title: string;
  amount: string;
  currency?: string;
};

export type DupeConfidence = "exact" | "likely" | "none";

export type RowIssue =
  | "dateMissing"
  | "dateInvalid"
  | "dateFuture"
  | "amountMissing"
  | "amountInvalid"
  | "amountZero"
  | "titleMissing"
  | "currencyMismatch";

/** Issues that make a row unimportable. */
const BLOCKING: RowIssue[] = [
  "dateMissing",
  "dateInvalid",
  "amountMissing",
  "amountInvalid",
  "amountZero",
  "titleMissing",
];

export type CrossCurrencyMode = "block" | "convert";

export type PreviewRow = {
  index: number;
  raw: RawImportRow;
  /** ISO date, null when unparseable. */
  date: string | null;
  /** Amount in `sourceCurrency`, null when unparseable. */
  sourceAmount: number | null;
  sourceCurrency: CurrencyCode;
  /** Amount stored on the transaction (account native), null when blocked. */
  amount: number | null;
  currency: CurrencyCode;
  /** True when the source currency was converted into the account currency. */
  converted: boolean;
  accountId: string;
  merchantLabel: string;
  category: string;
  categorySource: "rule" | "fallback" | "manual";
  dupe: DupeConfidence;
  issues: RowIssue[];
  valid: boolean;
  /** Requires human review before it is safe to import. */
  needsReview: boolean;
  /** Default selection; the user may override. */
  defaultSelected: boolean;
};

export type ExistingTx = {
  title: string;
  amount: number;
  date: string;
  accountId: string;
  currency?: CurrencyCode;
};

export type PreviewOptions = {
  accountId: string;
  accountCurrency: CurrencyCode;
  existing: ExistingTx[];
  rules?: CategoryRule[];
  merchants?: MerchantAlias[];
  fallbackCategory?: string;
  crossCurrency?: CrossCurrencyMode;
  /** Manual per-row category overrides (lock the category). */
  categoryOverrides?: Record<number, string>;
  /** Reference "now" for future-date detection. */
  now?: number;
};

const DAY = 86_400_000;
const LIKELY_WINDOW = 3 * DAY;
const FUTURE_TOLERANCE = DAY; // more than a day ahead is suspicious

function isCurrencyCode(v: string): v is CurrencyCode {
  return CURRENCIES.some((c) => c.code === v);
}

/** Normalizes a currency cell ("EUR", "€", "eur") to a supported code. */
export function normalizeCurrency(raw: string | undefined): CurrencyCode | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (isCurrencyCode(s)) return s;
  const bySymbol = CURRENCIES.find((c) => c.symbol === raw.trim());
  return bySymbol ? (bySymbol.code as CurrencyCode) : null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function dupeSignature(title: string, merchants: MerchantAlias[]): string {
  return resolveMerchant(title, merchants).key || title.toLowerCase().trim();
}

/**
 * Deterministic duplicate classification against a set of candidates that
 * already share account + currency + amount.
 */
export function classifyDuplicate(
  row: { date: string; key: string },
  candidates: { date: string; key: string }[],
): DupeConfidence {
  const t = +new Date(row.date);
  let best: DupeConfidence = "none";
  for (const c of candidates) {
    if (c.key !== row.key) continue; // different merchant → never a duplicate
    const delta = Math.abs(+new Date(c.date) - t);
    if (delta < DAY) return "exact";
    if (delta <= LIKELY_WINDOW) best = "likely";
  }
  return best;
}

type Bucket = { date: string; key: string };

function bucketKey(accountId: string, currency: string, amount: number): string {
  return `${accountId}|${currency}|${amount.toFixed(2)}`;
}

export function buildPreview(rows: RawImportRow[], opts: PreviewOptions): PreviewRow[] {
  const {
    accountId,
    accountCurrency,
    existing,
    rules,
    merchants = [],
    fallbackCategory = "other",
    crossCurrency = "block",
    categoryOverrides = {},
    now = Date.now(),
  } = opts;

  const index = new Map<string, Bucket[]>();
  for (const t of existing) {
    const cur = (t.currency ?? accountCurrency) as CurrencyCode;
    const k = bucketKey(t.accountId, cur, t.amount);
    const list = index.get(k) ?? [];
    list.push({ date: t.date, key: dupeSignature(t.title, merchants) });
    index.set(k, list);
  }

  const out: PreviewRow[] = [];

  rows.forEach((raw, i) => {
    const issues: RowIssue[] = [];
    const title = raw.title.replace(/\s+/g, " ").trim();
    if (!title) issues.push("titleMissing");

    const dateCell = raw.date.trim();
    let date: string | null = null;
    if (!dateCell) issues.push("dateMissing");
    else {
      date = parseDate(dateCell);
      if (!date) issues.push("dateInvalid");
      else if (+new Date(date) - now > FUTURE_TOLERANCE) issues.push("dateFuture");
    }

    const amountCell = raw.amount.trim();
    let sourceAmount: number | null = null;
    if (!amountCell) issues.push("amountMissing");
    else {
      const n = parseAmount(amountCell);
      if (n === null || !Number.isFinite(n)) issues.push("amountInvalid");
      else if (n === 0) issues.push("amountZero");
      else sourceAmount = n;
    }

    const sourceCurrency = normalizeCurrency(raw.currency) ?? accountCurrency;
    const mismatch = sourceCurrency !== accountCurrency;
    if (mismatch) issues.push("currencyMismatch");

    const blocked =
      issues.some((x) => BLOCKING.includes(x)) ||
      (mismatch && crossCurrency === "block");

    let amount: number | null = null;
    let converted = false;
    if (sourceAmount !== null && !issues.some((x) => BLOCKING.includes(x))) {
      if (mismatch && crossCurrency === "convert") {
        amount = round(convertAmount(sourceAmount, sourceCurrency, accountCurrency));
        converted = true;
      } else if (!mismatch) {
        amount = round(sourceAmount);
      }
    }

    const merchant = resolveMerchant(title, merchants);
    const override = categoryOverrides[i];
    const ruled =
      sourceAmount !== null
        ? resolveRuleCategory(rules, {
            title,
            amount: sourceAmount,
            merchantLabel: merchant.label,
          })
        : null;
    const category = override ?? ruled ?? fallbackCategory;
    const categorySource: PreviewRow["categorySource"] = override
      ? "manual"
      : ruled
        ? "rule"
        : "fallback";

    let dupe: DupeConfidence = "none";
    if (date && amount !== null) {
      const k = bucketKey(accountId, accountCurrency, amount);
      dupe = classifyDuplicate({ date, key: merchant.key }, index.get(k) ?? []);
      // register the row so later rows in the same file see it too
      const list = index.get(k) ?? [];
      list.push({ date, key: merchant.key });
      index.set(k, list);
    }

    const valid = !blocked && amount !== null && !!date;
    const needsReview =
      valid && (dupe === "likely" || issues.includes("dateFuture") || converted);

    out.push({
      index: i,
      raw,
      date,
      sourceAmount,
      sourceCurrency,
      amount,
      currency: accountCurrency,
      converted,
      accountId,
      merchantLabel: merchant.label,
      category,
      categorySource,
      dupe,
      issues,
      valid,
      needsReview,
      defaultSelected: valid && dupe === "none",
    });
  });

  return out;
}

export type PreviewTotals = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  exactDuplicates: number;
  likelyDuplicates: number;
  autoCategorized: number;
  needsReview: number;
  selected: number;
};

export function summarize(
  rows: PreviewRow[],
  selection: Record<number, boolean> = {},
): PreviewTotals {
  let valid = 0,
    invalid = 0,
    exact = 0,
    likely = 0,
    auto = 0,
    review = 0,
    selected = 0;
  for (const r of rows) {
    if (r.valid) valid++;
    else invalid++;
    if (r.dupe === "exact") exact++;
    if (r.dupe === "likely") likely++;
    if (r.categorySource !== "fallback") auto++;
    if (r.needsReview) review++;
    if (isSelected(r, selection)) selected++;
  }
  return {
    total: rows.length,
    valid,
    invalid,
    duplicates: exact + likely,
    exactDuplicates: exact,
    likelyDuplicates: likely,
    autoCategorized: auto,
    needsReview: review,
    selected,
  };
}

/** Effective selection state: user override wins, invalid rows never import. */
export function isSelected(row: PreviewRow, selection: Record<number, boolean>): boolean {
  if (!row.valid) return false;
  const o = selection[row.index];
  return o === undefined ? row.defaultSelected : o;
}

/** Builds store payloads for the selected rows. Never emits transfers/adjustments. */
export function toTransactions(
  rows: PreviewRow[],
  selection: Record<number, boolean> = {},
): Omit<Transaction, "id">[] {
  return rows
    .filter((r) => isSelected(r, selection))
    .map((r) => ({
      title: r.raw.title.replace(/\s+/g, " ").trim(),
      category: r.category,
      amount: r.amount as number,
      date: r.date as string,
      accountId: r.accountId,
      currency: r.currency,
      categoryLocked: r.categorySource === "manual",
      note: r.converted
        ? `${r.sourceAmount} ${r.sourceCurrency}`
        : undefined,
    }));
}

export type ImportOutcome = {
  imported: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  excluded: number;
};

/** Accounts for every parsed row so nothing is silently discarded. */
export function outcomeOf(
  rows: PreviewRow[],
  selection: Record<number, boolean> = {},
): ImportOutcome {
  let imported = 0,
    dup = 0,
    invalid = 0,
    excluded = 0;
  for (const r of rows) {
    if (isSelected(r, selection)) imported++;
    else if (!r.valid) invalid++;
    else if (r.dupe !== "none") dup++;
    else excluded++;
  }
  return { imported, skippedDuplicates: dup, skippedInvalid: invalid, excluded };
}
