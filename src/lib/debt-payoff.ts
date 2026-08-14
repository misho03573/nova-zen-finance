/**
 * Debt Payoff Planner engine.
 *
 * Pure math — no store, no currency access. Callers pass debts ALREADY
 * converted into a single display currency (exactly once, via
 * `useDisplayState()`), so the engine never re-converts and never mutates
 * native balances.
 */

export type PayoffStrategy = "minimum" | "snowball" | "avalanche";

export type DebtInput = {
  id: string;
  name: string;
  /** Balance owed, positive, in the shared calculation currency. */
  balance: number;
  /** Annual percentage rate. `undefined` = unknown, 0 = interest-free. */
  apr?: number;
  /** Minimum monthly payment. `undefined` = unknown. */
  minPayment?: number;
};

export type DebtPlanLine = {
  id: string;
  name: string;
  startBalance: number;
  /** Months from now until this debt hits zero. */
  months: number;
  interest: number;
  payoffDate: string; // ISO
  order: number; // 1-based payoff order
};

export type PayoffPlan = {
  strategy: PayoffStrategy;
  /** True when every included debt amortizes within the horizon. */
  feasible: boolean;
  months: number;
  totalInterest: number;
  totalPaid: number;
  debtFreeDate: string | null;
  lines: DebtPlanLine[];
  /** Debts excluded because they lack a usable minimum payment. */
  skipped: string[];
  /** Debts that can never amortize at the given payment level. */
  stalled: string[];
  /** Monthly total remaining balance, index 0 = today. */
  balanceSeries: number[];
};

const MAX_MONTHS = 720; // 60 years

/** A debt is plannable when it has a positive balance and a positive minimum payment. */
export function isPlannable(d: DebtInput): boolean {
  return d.balance > 0 && typeof d.minPayment === "number" && d.minPayment > 0;
}

/** True when at least one debt carries a known APR — needed for a fair comparison. */
export function hasAprData(debts: DebtInput[]): boolean {
  return debts.some((d) => typeof d.apr === "number");
}

function addMonths(base: Date, n: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), 1);
  d.setMonth(d.getMonth() + n);
  return d.toISOString();
}

function orderFor(strategy: PayoffStrategy, debts: DebtInput[]): string[] {
  const list = [...debts];
  if (strategy === "snowball") list.sort((a, b) => a.balance - b.balance);
  else if (strategy === "avalanche") list.sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0));
  return list.map((d) => d.id);
}

/**
 * Simulate month-by-month payoff.
 *
 * Each month: interest accrues on every balance (APR/12; unknown APR is
 * treated as 0 rather than invented), minimum payments are applied, then any
 * spare cash — the user's extra payment plus minimums freed by cleared debts
 * (the "snowball") — is thrown at the current target debt.
 *
 * `minimum` never rolls anything over: each debt just pays its own minimum.
 */
export function buildPayoffPlan(
  debts: DebtInput[],
  strategy: PayoffStrategy,
  extra = 0,
  now: Date = new Date(),
): PayoffPlan {
  const plannable = debts.filter(isPlannable);
  const skipped = debts.filter((d) => d.balance > 0 && !isPlannable(d)).map((d) => d.name);

  const state = new Map(
    plannable.map((d) => [
      d.id,
      { ...d, bal: d.balance, min: d.minPayment as number, interest: 0, months: 0, done: false },
    ]),
  );
  const priority = orderFor(strategy === "minimum" ? "avalanche" : strategy, plannable);
  const baseMinTotal = plannable.reduce((s, d) => s + (d.minPayment as number), 0);

  const balanceSeries: number[] = [plannable.reduce((s, d) => s + d.balance, 0)];
  const finishedOrder: string[] = [];
  let month = 0;

  while (month < MAX_MONTHS && [...state.values()].some((d) => !d.done)) {
    month += 1;
    const before = [...state.values()].reduce((s, d) => s + d.bal, 0);

    // 1. Accrue interest.
    for (const d of state.values()) {
      if (d.done) continue;
      const rate = (d.apr ?? 0) / 100 / 12;
      const i = d.bal * rate;
      d.bal += i;
      d.interest += i;
    }

    // 2. Minimum payments.
    let pool = strategy === "minimum" ? 0 : extra;
    for (const d of state.values()) {
      if (d.done) continue;
      const pay = Math.min(d.min, d.bal);
      d.bal -= pay;
      if (strategy !== "minimum") pool += d.min - pay; // partial min left over
    }
    if (strategy !== "minimum") {
      // Minimums freed by already-cleared debts roll into the pool.
      const activeMin = [...state.values()].reduce((s, d) => (d.done ? s : s + d.min), 0);
      pool += Math.max(0, baseMinTotal - activeMin);
    }

    // 3. Roll spare cash into the target debt(s).
    if (pool > 0) {
      for (const id of priority) {
        if (pool <= 0) break;
        const d = state.get(id);
        if (!d || d.done || d.bal <= 0) continue;
        const pay = Math.min(pool, d.bal);
        d.bal -= pay;
        pool -= pay;
      }
    }

    // 4. Settle.
    for (const d of state.values()) {
      if (d.done || d.bal > 0.005) continue;
      d.bal = 0;
      d.done = true;
      d.months = month;
      finishedOrder.push(d.id);
    }

    const after = [...state.values()].reduce((s, d) => s + d.bal, 0);
    balanceSeries.push(after);
    if (after >= before - 0.005 && after > 0) break; // not amortizing — bail out
  }

  const stalled = [...state.values()].filter((d) => !d.done).map((d) => d.name);
  const feasible = stalled.length === 0 && plannable.length > 0;

  const lines: DebtPlanLine[] = plannable.map((d) => {
    const s = state.get(d.id)!;
    const idx = finishedOrder.indexOf(d.id);
    return {
      id: d.id,
      name: d.name,
      startBalance: d.balance,
      months: s.months,
      interest: s.interest,
      payoffDate: s.done ? addMonths(now, s.months) : "",
      order: idx >= 0 ? idx + 1 : finishedOrder.length + 1,
    };
  });
  lines.sort((a, b) => a.order - b.order);

  const totalInterest = plannable.reduce((s, d) => s + state.get(d.id)!.interest, 0);
  const totalPaid = plannable.reduce((s, d) => s + d.balance, 0) + totalInterest;
  const months = feasible ? Math.max(0, ...lines.map((l) => l.months)) : month;

  return {
    strategy,
    feasible,
    months,
    totalInterest,
    totalPaid,
    debtFreeDate: feasible ? addMonths(now, months) : null,
    lines,
    skipped,
    stalled,
    balanceSeries,
  };
}

/** Interest saved by avalanche vs snowball (positive = avalanche wins). */
export function interestSaving(a: PayoffPlan, b: PayoffPlan): number {
  if (!a.feasible || !b.feasible) return 0;
  return b.totalInterest - a.totalInterest;
}
