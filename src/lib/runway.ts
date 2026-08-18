import type { Account, Transaction } from "@/lib/nova-store";
import { isAdjustment } from "@/lib/nova-store";

/**
 * Emergency Fund / Financial Runway engine.
 *
 * ALL monetary inputs must already be converted into the active display
 * currency exactly once (via `useDisplayState`). Nothing here converts, so
 * native amounts are never mutated and never double-converted.
 */

/** Account types that count as spendable, liquid money. */
export const LIQUID_TYPES: Account["type"][] = ["cash", "bank", "revolut"];

/** How many completed months of history the estimate prefers. */
export const PREFERRED_MONTHS = 3;

export type RunwayResult = {
  liquid: number;
  /** Average monthly expense across the analysed completed months. */
  avgMonthly: number;
  /** Average monthly expense restricted to essential categories. */
  avgEssential: number;
  /** Completed months actually used for the average. */
  monthsUsed: number;
  /** True when fewer than PREFERRED_MONTHS completed months were available. */
  limitedHistory: boolean;
  /** liquid / avgMonthly — null when there is no spending to divide by. */
  totalRunway: number | null;
  /** liquid / avgEssential — null when no essential spending is known. */
  essentialRunway: number | null;
  /** avgEssential × targetMonths — null when essential spend is unknown. */
  target: number | null;
  /** Remaining amount to reach the target (never negative). */
  remaining: number | null;
  /** 0..1 progress towards the target. */
  progress: number | null;
  state: RunwayState;
  /** Per-category average monthly spend, largest first. */
  byCategory: { category: string; avg: number; essential: boolean }[];
};

export type RunwayState = "none" | "critical" | "building" | "healthy" | "strong";

export function runwayState(months: number | null): RunwayState {
  if (months == null) return "none";
  if (months < 1) return "critical";
  if (months < 3) return "building";
  if (months < 6) return "healthy";
  return "strong";
}

/** Sum of liquid account balances (already display-converted). */
export function liquidFunds(accounts: Account[]): number {
  return accounts.filter((a) => LIQUID_TYPES.includes(a.type)).reduce((s, a) => s + a.balance, 0);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

/** Transfers, transfer legs and reconciliation adjustments are not spending. */
function isSpending(t: Transaction): boolean {
  if (isAdjustment(t)) return false;
  if (t.transferId || t.category === "transfer") return false;
  return t.amount < 0;
}

/** Completed month keys (most recent first), excluding the current month. */
export function completedMonthKeys(count: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

export function computeRunway(args: {
  accounts: Account[];
  transactions: Transaction[];
  essentialCategories: string[];
  targetMonths: number;
  now?: Date;
}): RunwayResult {
  const { accounts, transactions, essentialCategories, targetMonths } = args;
  const now = args.now ?? new Date();
  const essential = new Set(essentialCategories);
  const liquid = liquidFunds(accounts);

  const spending = transactions.filter(isSpending);
  const seenMonths = new Set(spending.map((t) => monthKey(new Date(t.date))));
  const candidates = completedMonthKeys(PREFERRED_MONTHS, now);
  // Use only completed months that actually contain data — never invent
  // spending for months where the user had no history at all.
  const months = candidates.filter((k) => seenMonths.has(k));
  const monthsUsed = months.length;

  const perCategory = new Map<string, number>();
  let total = 0;
  let essentialTotal = 0;
  for (const t of spending) {
    if (!months.includes(monthKey(new Date(t.date)))) continue;
    const v = Math.abs(t.amount);
    total += v;
    if (essential.has(t.category)) essentialTotal += v;
    perCategory.set(t.category, (perCategory.get(t.category) ?? 0) + v);
  }

  const avgMonthly = monthsUsed > 0 ? total / monthsUsed : 0;
  const avgEssential = monthsUsed > 0 ? essentialTotal / monthsUsed : 0;

  const totalRunway = avgMonthly > 0 ? liquid / avgMonthly : null;
  const essentialRunway = avgEssential > 0 ? liquid / avgEssential : null;

  const target = avgEssential > 0 ? avgEssential * targetMonths : null;
  const remaining = target == null ? null : Math.max(0, target - liquid);
  const progress = target == null || target <= 0 ? null : Math.min(1, liquid / target);

  const byCategory = [...perCategory.entries()]
    .map(([category, sum]) => ({
      category,
      avg: monthsUsed > 0 ? sum / monthsUsed : 0,
      essential: essential.has(category),
    }))
    .sort((a, b) => b.avg - a.avg);

  return {
    liquid,
    avgMonthly,
    avgEssential,
    monthsUsed,
    limitedHistory: monthsUsed > 0 && monthsUsed < PREFERRED_MONTHS,
    totalRunway,
    essentialRunway,
    target,
    remaining,
    progress,
    state: runwayState(essentialRunway ?? totalRunway),
    byCategory,
  };
}
