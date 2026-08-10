import type { CurrencyCode } from "@/lib/currency";

/**
 * A daily Net Worth snapshot.
 *
 * Values are ALWAYS stored in the neutral FX base (USD), never in the user's
 * display currency. That keeps history mathematically stable: switching the
 * display currency re-converts once at render time instead of rewriting or
 * double-converting stored values.
 *
 * Net = assets − liabilities. Income/expenses affect it only through account
 * balances; internal transfers net to zero, so they never move it.
 */
export type NetWorthSnapshot = {
  /** Local calendar day, `YYYY-MM-DD`. One snapshot per day (upserted). */
  date: string;
  /** Sum of all account balances, in `base`. */
  assets: number;
  /** Sum of all liability balances (positive number), in `base`. */
  liabilities: number;
  /** assets − liabilities, in `base`. */
  net: number;
  /** Currency the three amounts above are denominated in. Always "USD". */
  base: CurrencyCode;
};

export const SNAPSHOT_BASE: CurrencyCode = "USD";

/** Local calendar day key for a date (not UTC — snapshots are user-local). */
export function dayKey(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Insert or replace today's snapshot, keeping the list sorted by date. */
export function upsertSnapshot(
  list: NetWorthSnapshot[],
  snap: NetWorthSnapshot,
): NetWorthSnapshot[] {
  const rest = list.filter((s) => s.date !== snap.date);
  rest.push(snap);
  rest.sort((a, b) => (a.date < b.date ? -1 : 1));
  return rest;
}

/** True when the stored snapshot for the same day already matches. */
export function sameSnapshot(a: NetWorthSnapshot | undefined, b: NetWorthSnapshot) {
  if (!a) return false;
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.005;
  return (
    a.date === b.date && a.base === b.base && eq(a.assets, b.assets) && eq(a.liabilities, b.liabilities)
  );
}

export const NW_RANGES = ["1M", "3M", "6M", "1Y", "ALL"] as const;
export type NwRange = (typeof NW_RANGES)[number];

const RANGE_DAYS: Record<Exclude<NwRange, "ALL">, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 182,
  "1Y": 365,
};

export function filterByRange(list: NetWorthSnapshot[], range: NwRange): NetWorthSnapshot[] {
  if (range === "ALL") return list;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
  const key = dayKey(cutoff);
  return list.filter((s) => s.date >= key);
}

/**
 * Change since the first snapshot on/after the start of the current month
 * (falls back to the earliest snapshot in the list).
 */
export function monthChange(list: NetWorthSnapshot[]) {
  if (list.length === 0) return { delta: 0, pct: 0, hasBaseline: false };
  const now = new Date();
  const startKey = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const before = [...list].reverse().find((s) => s.date < startKey);
  const baseline = before ?? list[0];
  const latest = list[list.length - 1];
  const delta = latest.net - baseline.net;
  const pct = baseline.net !== 0 ? (delta / Math.abs(baseline.net)) * 100 : 0;
  return { delta, pct, hasBaseline: !!before || list.length > 1 };
}
