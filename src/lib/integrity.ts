/**
 * Phase 5 — Data Integrity / Health Check.
 *
 * A finance app must never silently carry broken data: an orphaned
 * transaction, a half-deleted transfer or a NaN amount quietly corrupts every
 * aggregate downstream (Net Worth, budgets, forecast). This module detects
 * those states and produces a repaired copy of the state. It is pure: it
 * never dispatches, so the caller decides when to apply the result.
 */
import type { NovaState, Transaction } from "@/lib/nova-store";

export type IssueKind =
  | "orphan_tx"
  | "duplicate_tx_id"
  | "bad_amount"
  | "bad_date"
  | "broken_transfer"
  | "unknown_category"
  | "orphan_budget"
  | "orphan_goal_account"
  | "orphan_subscription_account"
  | "orphan_recurring_account"
  | "orphan_automation_goal"
  | "negative_goal"
  | "negative_liability";

export type IntegritySeverity = "critical" | "warning";

export type IntegrityIssue = {
  kind: IssueKind;
  severity: IntegritySeverity;
  count: number;
  /** i18n key describing the issue. */
  titleKey: string;
  /** i18n key describing what the repair does. */
  fixKey: string;
  /** Ids of the affected records (transactions, goals, …). */
  ids: string[];
};

export const FALLBACK_CATEGORY = "other";

const isFiniteNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const validDate = (s: unknown) => typeof s === "string" && !Number.isNaN(Date.parse(s));

function issue(
  kind: IssueKind,
  severity: IntegritySeverity,
  ids: string[],
  titleKey: string,
  fixKey: string,
): IntegrityIssue | null {
  return ids.length ? { kind, severity, count: ids.length, titleKey, fixKey, ids } : null;
}

export function runIntegrityChecks(state: NovaState): IntegrityIssue[] {
  const accountIds = new Set(state.accounts.map((a) => a.id));
  const goalIds = new Set(state.goals.map((g) => g.id));
  const knownCats = new Set<string>([
    ...state.categories.map((c) => c.id),
    ...state.budgets.map((b) => b.category),
    "transfer",
    "adjustment",
    FALLBACK_CATEGORY,
  ]);

  const seen = new Set<string>();
  const dupIds: string[] = [];
  for (const t of state.transactions) {
    if (seen.has(t.id)) dupIds.push(t.id);
    seen.add(t.id);
  }

  const transferGroups = new Map<string, Transaction[]>();
  for (const t of state.transactions) {
    if (!t.transferId) continue;
    const g = transferGroups.get(t.transferId) ?? [];
    g.push(t);
    transferGroups.set(t.transferId, g);
  }
  const brokenTransfers: string[] = [];
  for (const [, legs] of transferGroups) {
    // A transfer is only neutral when both legs exist and cancel out.
    if (legs.length !== 2) brokenTransfers.push(...legs.map((l) => l.id));
  }

  const out: (IntegrityIssue | null)[] = [
    issue(
      "orphan_tx",
      "critical",
      state.transactions.filter((t) => !accountIds.has(t.accountId)).map((t) => t.id),
      "integrity.orphanTx",
      "integrity.fix.orphanTx",
    ),
    issue("duplicate_tx_id", "critical", dupIds, "integrity.dupTx", "integrity.fix.dupTx"),
    issue(
      "bad_amount",
      "critical",
      state.transactions.filter((t) => !isFiniteNum(t.amount)).map((t) => t.id),
      "integrity.badAmount",
      "integrity.fix.badAmount",
    ),
    issue(
      "bad_date",
      "warning",
      state.transactions.filter((t) => !validDate(t.date)).map((t) => t.id),
      "integrity.badDate",
      "integrity.fix.badDate",
    ),
    issue("broken_transfer", "critical", brokenTransfers, "integrity.transfer", "integrity.fix.transfer"),
    issue(
      "unknown_category",
      "warning",
      state.transactions.filter((t) => t.category && !knownCats.has(t.category)).map((t) => t.id),
      "integrity.unknownCat",
      "integrity.fix.unknownCat",
    ),
    issue(
      "orphan_budget",
      "warning",
      state.budgets.filter((b) => !isFiniteNum(b.limit) || b.limit <= 0).map((b) => b.id),
      "integrity.badBudget",
      "integrity.fix.badBudget",
    ),
    issue(
      "orphan_goal_account",
      "warning",
      state.goals.filter((g) => g.accountId && !accountIds.has(g.accountId)).map((g) => g.id),
      "integrity.goalAccount",
      "integrity.fix.goalAccount",
    ),
    issue(
      "orphan_subscription_account",
      "warning",
      state.subscriptions.filter((s) => s.accountId && !accountIds.has(s.accountId)).map((s) => s.id),
      "integrity.subAccount",
      "integrity.fix.subAccount",
    ),
    issue(
      "orphan_recurring_account",
      "critical",
      state.recurring.filter((r) => !accountIds.has(r.accountId)).map((r) => r.id),
      "integrity.recAccount",
      "integrity.fix.recAccount",
    ),
    issue(
      "orphan_automation_goal",
      "warning",
      state.automationRules.filter((r) => r.goalId && !goalIds.has(r.goalId)).map((r) => r.id),
      "integrity.autoGoal",
      "integrity.fix.autoGoal",
    ),
    issue(
      "negative_goal",
      "warning",
      state.goals.filter((g) => !isFiniteNum(g.saved) || g.saved < 0 || !isFiniteNum(g.target) || g.target <= 0).map(
        (g) => g.id,
      ),
      "integrity.badGoal",
      "integrity.fix.badGoal",
    ),
    issue(
      "negative_liability",
      "warning",
      state.liabilities.filter((l) => !isFiniteNum(l.balance) || l.balance < 0).map((l) => l.id),
      "integrity.badLiability",
      "integrity.fix.badLiability",
    ),
  ];
  return out.filter((i): i is IntegrityIssue => i !== null);
}

/**
 * Returns a repaired copy of `state` for the selected issue kinds.
 * Repairs are conservative: records are re-pointed or cleaned, and only
 * unrecoverable rows (orphans with no account to move to, duplicates) are
 * dropped. Balances are never recomputed here — reconciliation is the user's
 * explicit tool for that.
 */
export function repairState(state: NovaState, kinds: IssueKind[]): NovaState {
  const fix = new Set(kinds);
  const accountIds = new Set(state.accounts.map((a) => a.id));
  const goalIds = new Set(state.goals.map((g) => g.id));
  const fallbackAccount = state.accounts[0]?.id;
  const knownCats = new Set<string>([
    ...state.categories.map((c) => c.id),
    ...state.budgets.map((b) => b.category),
    "transfer",
    "adjustment",
    FALLBACK_CATEGORY,
  ]);

  let transactions = state.transactions;

  if (fix.has("duplicate_tx_id")) {
    const seen = new Set<string>();
    transactions = transactions.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }
  if (fix.has("orphan_tx")) {
    transactions = fallbackAccount
      ? transactions.map((t) => (accountIds.has(t.accountId) ? t : { ...t, accountId: fallbackAccount }))
      : transactions.filter((t) => accountIds.has(t.accountId));
  }
  if (fix.has("bad_amount")) {
    transactions = transactions.filter((t) => isFiniteNum(t.amount));
  }
  if (fix.has("bad_date")) {
    const now = new Date().toISOString();
    transactions = transactions.map((t) => (validDate(t.date) ? t : { ...t, date: now }));
  }
  if (fix.has("broken_transfer")) {
    const counts = new Map<string, number>();
    for (const t of transactions) if (t.transferId) counts.set(t.transferId, (counts.get(t.transferId) ?? 0) + 1);
    // A lone leg is real money movement — keep the record, drop the dangling
    // pairing so it stops being treated as a neutral transfer.
    transactions = transactions.map((t) =>
      t.transferId && counts.get(t.transferId) !== 2 ? { ...t, transferId: undefined } : t,
    );
  }
  if (fix.has("unknown_category")) {
    transactions = transactions.map((t) =>
      t.category && !knownCats.has(t.category) ? { ...t, category: FALLBACK_CATEGORY } : t,
    );
  }

  return {
    ...state,
    transactions,
    budgets: fix.has("orphan_budget")
      ? state.budgets.filter((b) => isFiniteNum(b.limit) && b.limit > 0)
      : state.budgets,
    goals: state.goals.map((g) => {
      let next = g;
      if (fix.has("orphan_goal_account") && g.accountId && !accountIds.has(g.accountId)) {
        next = { ...next, accountId: undefined };
      }
      if (fix.has("negative_goal")) {
        if (!isFiniteNum(next.saved) || next.saved < 0) next = { ...next, saved: 0 };
        if (!isFiniteNum(next.target) || next.target <= 0) next = { ...next, target: Math.max(1, next.saved || 1) };
      }
      return next;
    }),
    subscriptions: fix.has("orphan_subscription_account")
      ? state.subscriptions.map((s) => (s.accountId && !accountIds.has(s.accountId) ? { ...s, accountId: undefined } : s))
      : state.subscriptions,
    recurring: fix.has("orphan_recurring_account")
      ? fallbackAccount
        ? state.recurring.map((r) => (accountIds.has(r.accountId) ? r : { ...r, accountId: fallbackAccount }))
        : state.recurring.filter((r) => accountIds.has(r.accountId))
      : state.recurring,
    automationRules: fix.has("orphan_automation_goal")
      ? state.automationRules.map((r) =>
          r.goalId && !goalIds.has(r.goalId) ? { ...r, goalId: undefined, enabled: false } : r,
        )
      : state.automationRules,
    liabilities: fix.has("negative_liability")
      ? state.liabilities.map((l) => (isFiniteNum(l.balance) && l.balance >= 0 ? l : { ...l, balance: 0 }))
      : state.liabilities,
  };
}

/** Overall health: 100 = clean, each issue costs weight by severity. */
export function integrityScore(issues: IntegrityIssue[]): number {
  const penalty = issues.reduce((s, i) => s + (i.severity === "critical" ? 15 : 6), 0);
  return Math.max(0, 100 - penalty);
}
