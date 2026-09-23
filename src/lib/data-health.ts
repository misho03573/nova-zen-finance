/**
 * Financial Data Health — review-only scanner.
 *
 * This module answers one question: "is anything in my own records worth a
 * second look?". It is deliberately different from `integrity.ts`, which
 * detects structurally broken state and can repair it. Nothing here repairs,
 * merges, deletes, persists, syncs or exports anything: `scanDataHealth` is a
 * pure function over a snapshot and returns descriptions only. The UI may link
 * to an existing manual-edit surface, never act.
 *
 * Every rule is a plain, deterministic heuristic with an explicit threshold so
 * the reason shown to the user is the actual rule that fired — no opaque score.
 * All inputs are sanitized: malformed rows are skipped rather than trusted, so
 * a NaN amount or an invalid date can never crash the scan or invent findings.
 */
import type {
  Account,
  Recurring,
  Subscription,
  Transaction,
} from "@/lib/nova-store";
import { isAdjustment, isTransferTx } from "@/lib/nova-store";
import { merchantKey } from "@/lib/merchant";

export type HealthKind =
  | "duplicate"
  | "uncategorized"
  | "incomplete"
  | "outlier"
  | "orphan_ref"
  | "stale_schedule";

/** How strongly the rule matched. Shown verbatim — never a blended score. */
export type HealthConfidence = "high" | "medium" | "low";

/** Existing manual surfaces a finding may deep-link to. Read-only navigation. */
export type HealthLink = "/wallet" | "/automation" | "/subscriptions" | "/categories";

export type HealthFinding = {
  /** Stable id derived from the rule + the records involved. */
  id: string;
  kind: HealthKind;
  confidence: HealthConfidence;
  /** Ids of the records the finding refers to (never modified). */
  refs: string[];
  /** Human label for the record(s), already sanitized. */
  label: string;
  /** i18n key explaining why the rule fired. */
  reasonKey: string;
  /** Interpolation values for `reasonKey`. Numbers are pre-rounded. */
  reasonParams?: Record<string, string | number>;
  /** Monetary value to render with the active currency, when meaningful. */
  amount?: number;
  /** ISO date of the record, when meaningful. */
  date?: string;
  link: HealthLink;
};

export type HealthGroup = {
  kind: HealthKind;
  findings: HealthFinding[];
};

export type HealthReport = {
  groups: HealthGroup[];
  total: number;
  /** Records actually examined, after malformed rows were skipped. */
  scanned: { transactions: number; recurring: number; subscriptions: number };
  /** Rows dropped because they were unreadable (bad amount/date/shape). */
  skipped: number;
  /** Timestamp the scan ran at, for the "last checked" label. */
  ranAt: number;
};

/* ------------------------------------------------------------------ */
/* Thresholds — deliberately visible, so the UI can explain each rule. */
/* ------------------------------------------------------------------ */

/** Two charges this many days apart or less can be a duplicate. */
export const DUP_WINDOW_DAYS = 3;
/** Amounts within this absolute difference count as the same charge. */
export const DUP_AMOUNT_EPSILON = 0.01;
/** An expense this many times the category median is flagged. */
export const OUTLIER_FACTOR = 5;
/** …and this many times is flagged with high confidence. */
export const OUTLIER_STRONG_FACTOR = 10;
/** Minimum comparable history before outlier detection is meaningful. */
export const OUTLIER_MIN_SAMPLES = 8;
/** A scheduled item overdue by more than this many days looks stale. */
export const STALE_DAYS = 7;
/** Categories that mean "not categorised yet". */
export const VAGUE_CATEGORIES = new Set(["", "other", "uncategorized", "uncategorised", "unknown"]);
/** Hard cap so a pathological dataset cannot freeze the screen. */
const MAX_FINDINGS_PER_KIND = 50;

const DAY = 86_400_000;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function safeAmount(n: unknown): number | null {
  if (!finite(n)) return null;
  // Guard against absurd magnitudes that only come from corrupted input.
  if (Math.abs(n) > 1e12) return null;
  return n;
}

function safeTime(v: unknown): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type CleanTx = {
  id: string;
  title: string;
  merchantKey: string;
  category: string;
  amount: number;
  ts: number;
  date: string;
  accountId: string;
  transfer: boolean;
};

/** Drops anything unreadable instead of letting it reach a rule. */
function cleanTransactions(txs: readonly Transaction[] | undefined): { rows: CleanTx[]; skipped: number } {
  const rows: CleanTx[] = [];
  let skipped = 0;
  for (const t of Array.isArray(txs) ? txs : []) {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || !t.id) {
      skipped += 1;
      continue;
    }
    const amount = safeAmount(t.amount);
    const ts = safeTime(t.date);
    if (amount === null || ts === null) {
      skipped += 1;
      continue;
    }
    const title = safeText(t.title);
    rows.push({
      id: t.id,
      title,
      merchantKey: title ? merchantKey(title) : "",
      category: safeText(t.category).toLowerCase(),
      amount,
      ts,
      date: t.date,
      accountId: safeText(t.accountId),
      transfer: isTransferTx(t) || isAdjustment(t),
    });
  }
  return { rows, skipped };
}

function take(findings: HealthFinding[]): HealthFinding[] {
  return findings.slice(0, MAX_FINDINGS_PER_KIND);
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/**
 * Likely duplicates: same account, same sign, near-identical amount and the
 * same normalized merchant, within a few days. Transfers and reconciliation
 * records are excluded — a matching pair there is the design, not a mistake.
 */
export function findDuplicates(rows: CleanTx[]): HealthFinding[] {
  const out: HealthFinding[] = [];
  const candidates = rows
    .filter((r) => !r.transfer && r.amount !== 0 && (r.merchantKey || r.title))
    .sort((a, b) => a.ts - b.ts);

  const paired = new Set<string>();
  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i]!;
    if (paired.has(a.id)) continue;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j]!;
      const gapMs = b.ts - a.ts;
      if (gapMs > DUP_WINDOW_DAYS * DAY) break;
      if (paired.has(b.id)) continue;
      if (a.accountId !== b.accountId) continue;
      if (Math.sign(a.amount) !== Math.sign(b.amount)) continue;
      if (Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) > DUP_AMOUNT_EPSILON) continue;
      const keyA = a.merchantKey || a.title.toLowerCase();
      const keyB = b.merchantKey || b.title.toLowerCase();
      if (!keyA || keyA !== keyB) continue;

      const gapDays = Math.floor(gapMs / DAY);
      const confidence: HealthConfidence = gapDays === 0 ? "high" : gapDays <= 1 ? "medium" : "low";
      paired.add(a.id);
      paired.add(b.id);
      out.push({
        id: `dup:${a.id}:${b.id}`,
        kind: "duplicate",
        confidence,
        refs: [a.id, b.id],
        label: b.title || a.title,
        reasonKey: gapDays === 0 ? "dh.reason.dupSameDay" : "dh.reason.dupWindow",
        reasonParams: { days: gapDays },
        amount: round2(Math.abs(a.amount)),
        date: b.date,
        link: "/wallet",
      });
      break;
    }
  }
  return take(out);
}

/** Transactions with no real category yet. */
export function findUncategorized(rows: CleanTx[], knownCategories: Set<string>): HealthFinding[] {
  const out: HealthFinding[] = [];
  for (const r of rows) {
    if (r.transfer) continue;
    const vague = VAGUE_CATEGORIES.has(r.category);
    const unknown = !vague && knownCategories.size > 0 && !knownCategories.has(r.category);
    if (!vague && !unknown) continue;
    out.push({
      id: `cat:${r.id}`,
      kind: "uncategorized",
      confidence: vague ? "high" : "medium",
      refs: [r.id],
      label: r.title || r.category,
      reasonKey: vague ? "dh.reason.noCategory" : "dh.reason.unknownCategory",
      amount: round2(Math.abs(r.amount)),
      date: r.date,
      link: "/wallet",
    });
  }
  return take(out);
}

/** Transactions missing a description or an account link, or worth 0. */
export function findIncomplete(rows: CleanTx[], accountIds: Set<string>): HealthFinding[] {
  const out: HealthFinding[] = [];
  for (const r of rows) {
    let reasonKey: string | null = null;
    if (!r.title) reasonKey = "dh.reason.noTitle";
    else if (!r.accountId || !accountIds.has(r.accountId)) reasonKey = "dh.reason.noAccount";
    else if (r.amount === 0 && !r.transfer) reasonKey = "dh.reason.zeroAmount";
    if (!reasonKey) continue;
    out.push({
      id: `inc:${r.id}`,
      kind: "incomplete",
      confidence: "high",
      refs: [r.id],
      label: r.title,
      reasonKey,
      amount: round2(Math.abs(r.amount)),
      date: r.date,
      link: "/wallet",
    });
  }
  return take(out);
}

/**
 * Outliers relative to the user's *own* history: an expense several times the
 * median expense in the same category. Needs enough comparable rows first, so
 * a new category never produces noise.
 */
export function findOutliers(rows: CleanTx[]): HealthFinding[] {
  const byCat = new Map<string, CleanTx[]>();
  for (const r of rows) {
    if (r.transfer || r.amount >= 0) continue;
    const key = r.category || "other";
    const list = byCat.get(key) ?? [];
    list.push(r);
    byCat.set(key, list);
  }

  const out: HealthFinding[] = [];
  for (const [, list] of byCat) {
    if (list.length < OUTLIER_MIN_SAMPLES) continue;
    const med = median(list.map((r) => Math.abs(r.amount)));
    if (!(med > 0)) continue;
    for (const r of list) {
      const times = Math.abs(r.amount) / med;
      if (times < OUTLIER_FACTOR) continue;
      out.push({
        id: `out:${r.id}`,
        kind: "outlier",
        confidence: times >= OUTLIER_STRONG_FACTOR ? "high" : "medium",
        refs: [r.id],
        label: r.title,
        reasonKey: "dh.reason.outlier",
        reasonParams: { times: Math.round(times * 10) / 10, median: round2(med) },
        amount: round2(Math.abs(r.amount)),
        date: r.date,
        link: "/wallet",
      });
    }
  }
  out.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  return take(out);
}

/** Recurring items and subscriptions pointing at an account that is gone. */
export function findOrphanRefs(
  recurring: readonly Recurring[] | undefined,
  subscriptions: readonly Subscription[] | undefined,
  accountIds: Set<string>,
): HealthFinding[] {
  const out: HealthFinding[] = [];
  for (const r of Array.isArray(recurring) ? recurring : []) {
    if (!r || typeof r.id !== "string") continue;
    const acc = safeText(r.accountId);
    if (acc && accountIds.has(acc)) continue;
    out.push({
      id: `orf:r:${r.id}`,
      kind: "orphan_ref",
      confidence: "high",
      refs: [r.id],
      label: safeText(r.title),
      reasonKey: "dh.reason.orphanRecurring",
      link: "/automation",
    });
  }
  for (const s of Array.isArray(subscriptions) ? subscriptions : []) {
    if (!s || typeof s.id !== "string") continue;
    const acc = safeText(s.accountId);
    if (!acc || accountIds.has(acc)) continue;
    out.push({
      id: `orf:s:${s.id}`,
      kind: "orphan_ref",
      confidence: "high",
      refs: [s.id],
      label: safeText(s.name),
      reasonKey: "dh.reason.orphanSubscription",
      link: "/subscriptions",
    });
  }
  return take(out);
}

/** Scheduled items whose next date is well in the past — probably not running. */
export function findStaleSchedules(
  recurring: readonly Recurring[] | undefined,
  subscriptions: readonly Subscription[] | undefined,
  now: number,
): HealthFinding[] {
  const cutoff = now - STALE_DAYS * DAY;
  const out: HealthFinding[] = [];

  for (const r of Array.isArray(recurring) ? recurring : []) {
    if (!r || typeof r.id !== "string") continue;
    const ts = safeTime(r.nextDate);
    if (ts === null || ts >= cutoff) continue;
    const days = Math.floor((now - ts) / DAY);
    out.push({
      id: `stl:r:${r.id}`,
      kind: "stale_schedule",
      confidence: days > 60 ? "high" : "medium",
      refs: [r.id],
      label: safeText(r.title),
      reasonKey: "dh.reason.staleRecurring",
      reasonParams: { days },
      date: r.nextDate,
      link: "/automation",
    });
  }

  for (const s of Array.isArray(subscriptions) ? subscriptions : []) {
    if (!s || typeof s.id !== "string") continue;
    if ((s.status ?? "active") !== "active") continue;
    const ts = safeTime(s.nextDate);
    if (ts === null || ts >= cutoff) continue;
    const days = Math.floor((now - ts) / DAY);
    out.push({
      id: `stl:s:${s.id}`,
      kind: "stale_schedule",
      confidence: days > 60 ? "high" : "medium",
      refs: [s.id],
      label: safeText(s.name),
      reasonKey: "dh.reason.staleSubscription",
      reasonParams: { days },
      date: s.nextDate,
      link: "/subscriptions",
    });
  }

  out.sort((a, b) => Number(b.reasonParams?.days ?? 0) - Number(a.reasonParams?.days ?? 0));
  return take(out);
}

/* ------------------------------------------------------------------ */
/* Scan                                                                */
/* ------------------------------------------------------------------ */

export type HealthInput = {
  transactions?: readonly Transaction[];
  accounts?: readonly Account[];
  recurring?: readonly Recurring[];
  subscriptions?: readonly Subscription[];
  /** Known category ids; empty disables the "unknown category" rule. */
  categoryIds?: readonly string[];
  now?: number;
};

/** Order the UI renders groups in. */
export const HEALTH_KINDS: HealthKind[] = [
  "duplicate",
  "incomplete",
  "uncategorized",
  "outlier",
  "orphan_ref",
  "stale_schedule",
];

/**
 * Pure, in-memory scan. Never mutates its input and never touches storage,
 * network, sync or AI. Call it again to refresh.
 */
export function scanDataHealth(input: HealthInput): HealthReport {
  const nowRaw = input.now;
  const now = finite(nowRaw) ? nowRaw : Date.now();

  const accounts = Array.isArray(input.accounts) ? input.accounts : [];
  const accountIds = new Set(
    accounts.filter((a) => a && typeof a.id === "string" && a.id).map((a) => a.id),
  );
  const knownCategories = new Set(
    (Array.isArray(input.categoryIds) ? input.categoryIds : [])
      .filter((c): c is string => typeof c === "string" && Boolean(c))
      .map((c) => c.toLowerCase()),
  );
  // Categories that are structural, not user-chosen.
  knownCategories.delete("");
  for (const c of ["transfer", "adjustment", "income"]) if (knownCategories.size) knownCategories.add(c);

  const { rows, skipped } = cleanTransactions(input.transactions);
  const recurring = Array.isArray(input.recurring) ? input.recurring : [];
  const subscriptions = Array.isArray(input.subscriptions) ? input.subscriptions : [];

  const byKind: Record<HealthKind, HealthFinding[]> = {
    duplicate: findDuplicates(rows),
    incomplete: findIncomplete(rows, accountIds),
    uncategorized: findUncategorized(rows, knownCategories),
    outlier: findOutliers(rows),
    orphan_ref: findOrphanRefs(recurring, subscriptions, accountIds),
    stale_schedule: findStaleSchedules(recurring, subscriptions, now),
  };

  const groups: HealthGroup[] = HEALTH_KINDS.map((kind) => ({ kind, findings: byKind[kind] })).filter(
    (g) => g.findings.length > 0,
  );

  return {
    groups,
    total: groups.reduce((s, g) => s + g.findings.length, 0),
    scanned: {
      transactions: rows.length,
      recurring: recurring.length,
      subscriptions: subscriptions.length,
    },
    skipped,
    ranAt: now,
  };
}
