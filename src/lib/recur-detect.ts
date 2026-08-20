import type {
  Account,
  BillingFrequency,
  Recurring,
  Subscription,
  Transaction,
} from "@/lib/nova-store";
import type { CurrencyCode } from "@/lib/currency";

const DAY = 86400000;

export type ConfidenceLevel = "high" | "possible";

export type DetectedRecurring = {
  /** Stable identifier for the pattern — persists ignore decisions. */
  key: string;
  name: string;
  merchant?: string;
  /** Positive charge amount, in the pattern's native currency. */
  amount: number;
  currency: CurrencyCode;
  accountId?: string;
  category: string;
  frequency: BillingFrequency;
  /** Estimated next payment (ISO). */
  nextDate: string;
  lastDate: string;
  count: number;
  confidence: number;
  level: ConfidenceLevel;
};

type FreqSpec = { freq: BillingFrequency; days: number; tol: number };

/** Interval targets, with tolerance for weekends and billing-date shifts. */
const FREQS: FreqSpec[] = [
  { freq: "weekly", days: 7, tol: 2 },
  { freq: "monthly", days: 30.44, tol: 5 },
  { freq: "quarterly", days: 91.3, tol: 12 },
  { freq: "yearly", days: 365, tol: 30 },
];

/** Max relative amount drift tolerated inside one pattern (price increases). */
const AMOUNT_TOL = 0.15;
const MIN_MATCHES = 3;

export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Bucket amounts so only a significant (>~20%) change yields a new pattern key. */
function amountBucket(a: number): number {
  return Math.round(Math.log(Math.max(a, 0.01)) / Math.log(1.2));
}

function isCandidateTx(t: Transaction): boolean {
  if (t.kind === "adjustment") return false;
  if (t.transferId) return false;
  if (t.category === "transfer") return false;
  return t.amount < 0; // expenses only — never income
}

function matchesExisting(
  name: string,
  amount: number,
  subs: Subscription[],
  recurring: Recurring[],
): boolean {
  const n = normName(name);
  if (!n) return false;
  const near = (a: number, b: number) =>
    a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= AMOUNT_TOL;
  const nameHit = (label?: string) => {
    const t = normName(label ?? "");
    return !!t && (t.includes(n) || n.includes(t));
  };
  return (
    subs.some((s) => (nameHit(s.name) || nameHit(s.merchant)) && near(Math.abs(s.amount), amount)) ||
    recurring.some((r) => nameHit(r.title) && near(Math.abs(r.amount), amount))
  );
}

/** Longest trailing run of dates whose gaps all fit the frequency tolerance. */
function trailingRun(times: number[], spec: FreqSpec): number[] {
  let start = times.length - 1;
  for (let i = times.length - 1; i > 0; i--) {
    const gap = (times[i] - times[i - 1]) / DAY;
    if (Math.abs(gap - spec.days) <= spec.tol) start = i - 1;
    else break;
  }
  return times.slice(start);
}

export function detectRecurring(args: {
  transactions: Transaction[];
  subscriptions?: Subscription[];
  recurring?: Recurring[];
  accounts?: Account[];
  ignored?: string[];
  fallbackCurrency?: CurrencyCode;
  now?: number;
}): DetectedRecurring[] {
  const now = args.now ?? Date.now();
  const subs = args.subscriptions ?? [];
  const recs = args.recurring ?? [];
  const ignored = new Set(args.ignored ?? []);
  const accCur = new Map((args.accounts ?? []).map((a) => [a.id, a.currency]));
  const fallback = (args.fallbackCurrency ?? "USD") as CurrencyCode;

  // Group by merchant/description + native currency — never mix currencies.
  const groups = new Map<string, Transaction[]>();
  for (const t of args.transactions) {
    if (!isCandidateTx(t)) continue;
    const n = normName(t.title);
    if (n.length < 3) continue;
    const cur = (t.currency ?? accCur.get(t.accountId) ?? fallback) as CurrencyCode;
    const k = `${n}|${cur}`;
    const list = groups.get(k);
    if (list) list.push(t);
    else groups.set(k, [t]);
  }

  const out: DetectedRecurring[] = [];
  for (const [k, list] of groups) {
    if (list.length < MIN_MATCHES) continue;
    const sorted = [...list].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const times = sorted.map((t) => +new Date(t.date));
    const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY);
    const med = median(gaps);
    const spec = FREQS.find((f) => Math.abs(med - f.days) <= f.tol);
    if (!spec) continue;

    const run = trailingRun(times, spec);
    if (run.length < MIN_MATCHES) continue;
    const runTx = sorted.filter((t) => run.includes(+new Date(t.date)));
    const amounts = runTx.map((t) => Math.abs(t.amount));
    const amt = median(amounts);
    if (amt <= 0) continue;
    const amountDrift = Math.max(...amounts.map((a) => Math.abs(a - amt) / amt));
    if (amountDrift > AMOUNT_TOL) continue;

    const runGaps = run.slice(1).map((t, i) => (t - run[i]) / DAY);
    const jitter = Math.max(...runGaps.map((g) => Math.abs(g - spec.days))) / spec.tol;

    const last = runTx[runTx.length - 1];
    const cur = k.split("|")[1] as CurrencyCode;
    if (matchesExisting(last.title, amt, subs, recs)) continue;

    let next = run[run.length - 1] + spec.days * DAY;
    let guard = 0;
    while (next < now && guard++ < 400) next += spec.days * DAY;

    const countScore = Math.min(run.length, 6) / 6; // more evidence = better
    const intervalScore = 1 - Math.min(jitter, 1);
    const amountScore = 1 - Math.min(amountDrift / AMOUNT_TOL, 1);
    const confidence =
      Math.round((0.4 * countScore + 0.35 * intervalScore + 0.25 * amountScore) * 100) / 100;

    const key = `${normName(last.title)}|${cur}|${spec.freq}|${amountBucket(amt)}`;
    if (ignored.has(key)) continue;

    out.push({
      key,
      name: last.title,
      merchant: last.title,
      amount: Math.round(amt * 100) / 100,
      currency: cur,
      accountId: last.accountId,
      category: last.category,
      frequency: spec.freq,
      nextDate: new Date(next).toISOString(),
      lastDate: new Date(run[run.length - 1]).toISOString(),
      count: run.length,
      confidence,
      level: confidence >= 0.75 && run.length >= 4 ? "high" : "possible",
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence || b.count - a.count);
}
