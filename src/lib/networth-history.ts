import type { CurrencyCode } from "@/lib/currency";
import { convertWith, isLegacyFx, type FxMeta } from "@/lib/fx";

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
  /**
   * Rate basis used to convert the native account/liability balances into
   * `base` on the capture day. Frozen forever: past snapshots therefore never
   * re-price when today's rate table changes.
   */
  fx?: FxMeta;
  /** Captured before FX metadata existed. Value preserved, basis unknown. */
  legacy?: boolean;
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

/**
 * Non-destructive migration for history stored before FX metadata existed.
 * Values are never recomputed or rewritten — the snapshot is only flagged so
 * the UI can explain that its rate basis is unknown.
 */
export function migrateSnapshots(list: NetWorthSnapshot[] | undefined): NetWorthSnapshot[] {
  if (!list || list.length === 0) return list ?? [];
  let changed = false;
  const out = list.map((s) => {
    if (!isLegacyFx(s.fx) || s.legacy) return s;
    changed = true;
    return { ...s, legacy: true };
  });
  return changed ? out : list;
}

/**
 * Presentation-only conversion of a frozen snapshot into the display currency.
 * The stored value is never mutated and never recomputed from today's balances.
 */
export function snapshotIn(snap: NetWorthSnapshot, to: CurrencyCode) {
  const from = (snap.base ?? SNAPSHOT_BASE) as CurrencyCode;
  return {
    date: snap.date,
    assets: convertWith(snap.assets, from, to),
    liabilities: convertWith(snap.liabilities, from, to),
    net: convertWith(snap.net, from, to),
    legacy: Boolean(snap.legacy),
  };
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
export function monthChange(list: NetWorthSnapshot[], asOf: Date = new Date()) {
  if (list.length === 0) return { delta: 0, pct: 0, hasBaseline: false };
  const now = asOf;
  const startKey = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const before = [...list].reverse().find((s) => s.date < startKey);
  const baseline = before ?? list[0];
  const latest = list[list.length - 1];
  const delta = latest.net - baseline.net;
  const pct = baseline.net !== 0 ? (delta / Math.abs(baseline.net)) * 100 : 0;
  return { delta, pct, hasBaseline: !!before || list.length > 1 };
}
