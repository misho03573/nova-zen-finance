import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { CurrencyCode } from "@/lib/currency";
import { convertAmount, useCurrency } from "@/lib/currency";
import { defaultCategories, type UserCategory } from "@/lib/categories";
import { resolveRuleCategory, type CategoryRule } from "@/lib/category-rules";
import {
  dayKey,
  sameSnapshot,
  upsertSnapshot,
  SNAPSHOT_BASE,
  type NetWorthSnapshot,
} from "@/lib/networth-history";

export type { CategoryRule } from "@/lib/category-rules";

/** Round a monetary value to the currency's smallest unit (JPY = whole, else 2dp). */
function round(n: number, cur?: CurrencyCode): number {
  const d = cur === "JPY" ? 1 : 100;
  return Math.round((n + Number.EPSILON) * d) / d;
}

export type AccountType = "cash" | "bank" | "revolut" | "trading" | "crypto";

export type Account = {
  id: string;
  name: string;
  number: string;
  holder: string;
  balance: number;
  gradient: string;
  brand: string;
  type: AccountType;
  /** Native currency of this account. Balance & transactions are stored in this currency. */
  currency?: CurrencyCode;
};

export type Transaction = {
  id: string;
  title: string;
  category: string;
  amount: number; // negative = expense
  date: string; // ISO string
  accountId: string;
  note?: string;
  recurringId?: string;
  /** Currency in which `amount` is stored. Inherits the account's native currency. */
  currency?: CurrencyCode;
  /** Links the two legs of a transfer together. */
  transferId?: string;
  /** True when the user picked the category by hand — rules must not override it. */
  categoryLocked?: boolean;
};

export type Goal = {
  id: string;
  name: string;
  saved: number;
  target: number;
  emoji: string;
  eta: string;
  monthly?: number;
  /** Native currency the goal amounts are stored in. Legacy goals fall back to USD. */
  currency?: CurrencyCode;
};

export type Budget = {
  id: string;
  category: string;
  limit: number;
  /** Native currency the limit is denominated in. Legacy budgets = USD. */
  currency?: CurrencyCode;
};

export type Frequency = "weekly" | "monthly" | "yearly";

export type Recurring = {
  id: string;
  title: string;
  category: string;
  amount: number; // signed like transactions
  accountId: string;
  frequency: Frequency;
  nextDate: string; // ISO
  note?: string;
  currency?: CurrencyCode;
};

export type Settings = {
  notifications: boolean;
  biometric: boolean;
  budgetAlerts: boolean;
  pinEnabled?: boolean;
  pin?: string;
  faceId?: boolean;
  touchId?: boolean;
  autoLockMinutes?: number;
  hideBalances?: boolean;
  cloudSync?: boolean;
  accent?: string; // hex or oklch string, applied to --primary
  language?: string; // "en" | "bg" | "de" | "fr" | "es"
};

export type NovaState = {
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  budgets: Budget[];
  recurring: Recurring[];
  settings: Settings;
  liabilities: Liability[];
  subscriptions: Subscription[];
  automationRules: AutomationRule[];
  categories: UserCategory[];
  categoryRules: CategoryRule[];
  /** Daily Net Worth snapshots, stored in USD base. One row per calendar day. */
  netWorthHistory: NetWorthSnapshot[];
};

export type LiabilityType = "loan" | "credit_card" | "mortgage";
export type Liability = {
  id: string;
  name: string;
  type: LiabilityType;
  balance: number; // amount owed, positive number
  apr?: number;
  minPayment?: number;
  /**
   * Native currency the balance is stored in. Legacy rows created before
   * multi-currency liabilities have no value — they are migrated to
   * {@link LEGACY_LIABILITY_CURRENCY} on hydrate.
   */
  currency?: CurrencyCode;
};

/**
 * Documented fallback for liabilities persisted before the `currency` field
 * existed. USD is the app's neutral FX base, which is exactly how those
 * balances were previously interpreted by Net Worth — so migration is a
 * no-op in value terms.
 */
export const LEGACY_LIABILITY_CURRENCY: CurrencyCode = "USD";

/** Native currency of a liability (with legacy fallback). */
export function liabilityCurrency(l: Liability): CurrencyCode {
  return (l.currency ?? LEGACY_LIABILITY_CURRENCY) as CurrencyCode;
}

/** Native currency of a budget limit (legacy budgets are USD-denominated). */
export function budgetCurrency(b: Budget): CurrencyCode {
  return (b.currency ?? LEGACY_LIABILITY_CURRENCY) as CurrencyCode;
}

/** Native currency of a savings goal (legacy rows are USD). */
export function goalCurrency(g: Goal): CurrencyCode {
  return (g.currency ?? LEGACY_LIABILITY_CURRENCY) as CurrencyCode;
}

export type Subscription = {
  id: string;
  name: string;
  amount: number; // cost per billing period, positive
  category: string;
  nextDate: string;
  color: string;
  emoji: string;
  /** Merchant / provider label used for future matching. */
  merchant?: string;
  /** Native currency of the charge. Defaults to the linked account's currency. */
  currency?: CurrencyCode;
  /** Account the charge is billed to. */
  accountId?: string;
  frequency?: BillingFrequency;
  status?: SubscriptionStatus;
  notes?: string;
};

export const SUB_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type BillingFrequency = (typeof SUB_FREQUENCIES)[number];
export const SUB_STATUSES = ["active", "paused", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUB_STATUSES)[number];

export type AutomationRule = {
  id: string;
  kind: "roundup" | "salary_percent" | "weekly_transfer" | "goal_auto";
  enabled: boolean;
  label: string;
  amount?: number; // fixed amount or percent
  goalId?: string;
};

const GUEST_KEY = "nova.store.v3";
function keyFor(userId: string | null) {
  return userId ? `nova.store.v3.${userId}` : GUEST_KEY;
}

function iso(daysAgo: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoAhead(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * DEMO DATA — guest mode only.
 * Never hydrated for an authenticated user: signing up always starts from
 * {@link emptyState}. See the hydration effect in `NovaProvider`.
 */
const seed: NovaState = {
  accounts: [
    {
      id: "c1",
      name: "NOVA Metal",
      number: "•••• 4821",
      holder: "A. MORGAN",
      balance: 8420.12,
      gradient: "var(--gradient-wallet)",
      brand: "Visa",
      type: "bank",
    },
    {
      id: "c2",
      name: "NOVA Savings",
      number: "•••• 7712",
      holder: "A. MORGAN",
      balance: 3540.43,
      gradient: "var(--gradient-accent)",
      brand: "Mastercard",
      type: "bank",
    },
    {
      id: "c3",
      name: "Revolut",
      number: "•••• 0293",
      holder: "A. MORGAN",
      balance: 520.0,
      gradient: "linear-gradient(135deg, oklch(0.35 0.12 200), oklch(0.25 0.1 260))",
      brand: "Visa",
      type: "revolut",
    },
    {
      id: "c4",
      name: "Cash",
      number: "Wallet",
      holder: "A. MORGAN",
      balance: 240,
      gradient: "linear-gradient(135deg, oklch(0.4 0.08 145), oklch(0.28 0.06 155))",
      brand: "Cash",
      type: "cash",
    },
    {
      id: "c5",
      name: "Trading 212",
      number: "Portfolio",
      holder: "A. MORGAN",
      balance: 6280.44,
      gradient: "linear-gradient(135deg, oklch(0.38 0.12 250), oklch(0.24 0.08 280))",
      brand: "Invest",
      type: "trading",
    },
    {
      id: "c6",
      name: "Crypto",
      number: "BTC · ETH · SOL",
      holder: "A. MORGAN",
      balance: 3120.9,
      gradient: "linear-gradient(135deg, oklch(0.55 0.16 60), oklch(0.32 0.12 30))",
      brand: "Wallet",
      type: "crypto",
    },
  ],
  transactions: [
    { id: "t1", title: "Blue Bottle Coffee", category: "coffee", amount: -6.5, date: iso(0, 9, 12), accountId: "c1" },
    { id: "t2", title: "Whole Foods", category: "food", amount: -84.32, date: iso(0, 8, 4), accountId: "c1" },
    { id: "t3", title: "Uber", category: "transport", amount: -18.9, date: iso(1, 21, 48), accountId: "c1" },
    { id: "t4", title: "Spotify", category: "entertainment", amount: -11.99, date: iso(1, 12, 0), accountId: "c1" },
    { id: "t5", title: "Salary — Acme Inc.", category: "salary", amount: 6200.0, date: iso(5, 9, 0), accountId: "c1" },
    { id: "t6", title: "Aesop", category: "shopping", amount: -142.0, date: iso(6, 17, 22), accountId: "c1" },
    { id: "t7", title: "Con Edison", category: "bills", amount: -96.14, date: iso(8, 7, 0), accountId: "c1" },
    { id: "t8", title: "Delta Airlines", category: "travel", amount: -412.5, date: iso(11, 15, 30), accountId: "c3" },
  ],
  goals: [
    { id: "g1", name: "Emergency Fund", saved: 4200, target: 10000, emoji: "🛟", eta: "Dec 2026", monthly: 400 },
    { id: "g2", name: "Tokyo Trip", saved: 1830, target: 3500, emoji: "🗼", eta: "Mar 2027", monthly: 250 },
    { id: "g3", name: "New MacBook", saved: 940, target: 2500, emoji: "💻", eta: "Sep 2026", monthly: 200 },
    { id: "g4", name: "Down Payment", saved: 12400, target: 60000, emoji: "🏡", eta: "2029", monthly: 800 },
  ],
  budgets: [
    { id: "b1", category: "food", limit: 800 },
    { id: "b2", category: "shopping", limit: 500 },
    { id: "b3", category: "transport", limit: 250 },
    { id: "b4", category: "entertainment", limit: 200 },
    { id: "b5", category: "coffee", limit: 100 },
    { id: "b6", category: "bills", limit: 400 },
  ],
  recurring: [
    { id: "r1", title: "Rent", category: "rent", amount: -1850, accountId: "c1", frequency: "monthly", nextDate: isoAhead(4) },
    { id: "r2", title: "Netflix", category: "entertainment", amount: -15.99, accountId: "c1", frequency: "monthly", nextDate: isoAhead(7) },
    { id: "r3", title: "Con Edison", category: "bills", amount: -96.14, accountId: "c1", frequency: "monthly", nextDate: isoAhead(9) },
    { id: "r4", title: "Salary — Acme Inc.", category: "salary", amount: 6200, accountId: "c1", frequency: "monthly", nextDate: isoAhead(12) },
    { id: "r5", title: "iCloud+", category: "bills", amount: -2.99, accountId: "c3", frequency: "monthly", nextDate: isoAhead(2) },
  ],
  settings: {
    notifications: true,
    biometric: false,
    budgetAlerts: true,
    pinEnabled: false,
    faceId: true,
    touchId: false,
    autoLockMinutes: 5,
    hideBalances: false,
    cloudSync: false,
    accent: "default",
    language: "en",
  },
  liabilities: [
    { id: "l1", name: "Student Loan", type: "loan", balance: 12400, apr: 4.5, minPayment: 220, currency: "USD" },
    { id: "l2", name: "Amex Platinum", type: "credit_card", balance: 1840, apr: 21.9, minPayment: 60, currency: "USD" },
    { id: "l3", name: "Mortgage", type: "mortgage", balance: 184000, apr: 3.2, minPayment: 1250, currency: "USD" },
  ],
  subscriptions: [
    { id: "s1", name: "Netflix", amount: 15.99, category: "entertainment", nextDate: isoAhead(6), color: "#E50914", emoji: "🎬" },
    { id: "s2", name: "Spotify", amount: 10.99, category: "entertainment", nextDate: isoAhead(11), color: "#1DB954", emoji: "🎧" },
    { id: "s3", name: "ChatGPT Plus", amount: 20, category: "subscription", nextDate: isoAhead(3), color: "#10a37f", emoji: "✨" },
    { id: "s4", name: "Phone Plan", amount: 35, category: "utilities", nextDate: isoAhead(14), color: "#3b82f6", emoji: "📱" },
    { id: "s5", name: "Internet", amount: 49, category: "utilities", nextDate: isoAhead(20), color: "#8b5cf6", emoji: "🌐" },
    { id: "s6", name: "iCloud+", amount: 2.99, category: "subscription", nextDate: isoAhead(2), color: "#94a3b8", emoji: "☁️" },
  ],
  automationRules: [
    { id: "ar1", kind: "roundup", enabled: true, label: "Round up purchases", goalId: "g1" },
    { id: "ar2", kind: "salary_percent", enabled: true, label: "Save 10% of salary", amount: 10, goalId: "g1" },
    { id: "ar3", kind: "weekly_transfer", enabled: false, label: "Every Monday", amount: 50, goalId: "g2" },
  ],
  categories: defaultCategories,
  categoryRules: [],
  netWorthHistory: [],
};

const emptyState: NovaState = {
  accounts: [],
  transactions: [],
  goals: [],
  budgets: [],
  recurring: [],
  settings: { ...seed.settings },
  liabilities: [],
  subscriptions: [],
  automationRules: [],
  categories: defaultCategories,
  categoryRules: [],
  netWorthHistory: [],
};

type Action =
  | { type: "hydrate"; state: NovaState }
  | { type: "snapshotNetWorth"; snap: NetWorthSnapshot }
  | { type: "addTransaction"; tx: Transaction }
  | { type: "updateTransaction"; tx: Transaction }
  | { type: "deleteTransaction"; id: string }
  | { type: "addAccount"; account: Account }
  | { type: "updateAccount"; account: Account }
  | { type: "deleteAccount"; id: string; reassignTo?: string }
  | { type: "addGoal"; goal: Goal }
  | { type: "updateGoal"; goal: Goal }
  | { type: "deleteGoal"; id: string }
  | {
      type: "contributeGoal";
      id: string;
      amount: number;
      /** Currency `amount` is expressed in. Defaults to the goal's own currency. */
      currency?: CurrencyCode;
      /** When set, the money actually moves out of (or back into) this account. */
      accountId?: string;
      date?: string;
    }
  | { type: "setBudget"; category: string; limit: number; currency: CurrencyCode }
  | { type: "deleteBudget"; id: string }
  | { type: "addRecurring"; rec: Recurring }
  | { type: "deleteRecurring"; id: string }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "addLiability"; l: Liability }
  | { type: "updateLiability"; l: Liability }
  | { type: "deleteLiability"; id: string }
  | { type: "addSubscription"; s: Subscription }
  | { type: "updateSubscription"; s: Subscription }
  | { type: "setSubscriptionStatus"; id: string; status: SubscriptionStatus }
  | { type: "deleteSubscription"; id: string }
  | { type: "toggleAutomation"; id: string }
  | { type: "addAutomation"; rule: AutomationRule }
  | { type: "deleteAutomation"; id: string }
  | { type: "importTransactions"; txs: Transaction[] }
  | { type: "advanceRecurring" }
  | { type: "transfer"; fromId: string; toId: string; amount: number; date: string; note?: string }
  | { type: "addCategory"; c: UserCategory }
  | { type: "updateCategory"; c: UserCategory }
  | { type: "deleteCategory"; id: string; reassignTo?: string }
  | { type: "addCategoryRule"; rule: CategoryRule }
  | { type: "updateCategoryRule"; rule: CategoryRule }
  | { type: "deleteCategoryRule"; id: string }
  | { type: "toggleCategoryRule"; id: string };

function reducer(state: NovaState, action: Action): NovaState {
  switch (action.type) {
    case "hydrate":
      return {
        ...emptyState,
        ...action.state,
        settings: { ...emptyState.settings, ...action.state.settings },
        // Migrate legacy liabilities that predate per-row currency.
        liabilities: (action.state.liabilities ?? []).map((l) => ({
          ...l,
          currency: (l.currency ?? LEGACY_LIABILITY_CURRENCY) as CurrencyCode,
        })),
        subscriptions: action.state.subscriptions ?? [],
        automationRules: action.state.automationRules ?? [],
        categories: mergeCategories(action.state.categories),
        categoryRules: action.state.categoryRules ?? [],
        netWorthHistory: action.state.netWorthHistory ?? [],
      };
    case "snapshotNetWorth":
      return {
        ...state,
        netWorthHistory: upsertSnapshot(state.netWorthHistory ?? [], action.snap),
      };
    case "addTransaction": {
      const accCur = state.accounts.find((a) => a.id === action.tx.accountId)?.currency;
      const ruled = action.tx.categoryLocked
        ? null
        : resolveRuleCategory(state.categoryRules, action.tx);
      const tx: Transaction = {
        ...action.tx,
        category: ruled ?? action.tx.category,
        amount: round(action.tx.amount, action.tx.currency ?? accCur),
      };
      const accounts = state.accounts.map((a) =>
        a.id === tx.accountId ? { ...a, balance: round(a.balance + tx.amount, a.currency) } : a,
      );
      return {
        ...state,
        accounts,
        transactions: [tx, ...state.transactions],
      };
    }
    case "updateTransaction": {
      const prev = state.transactions.find((t) => t.id === action.tx.id);
      if (!prev) return state;
      const nextAcc = state.accounts.find((a) => a.id === action.tx.accountId);
      // Re-denominate amount into the new account's currency if the account
      // changed. Amount is preserved in value terms via FX conversion.
      let nextAmount = action.tx.amount;
      let nextCurrency = action.tx.currency ?? nextAcc?.currency;
      if (prev.accountId !== action.tx.accountId && nextAcc?.currency) {
        const prevCur = prev.currency ??
          state.accounts.find((a) => a.id === prev.accountId)?.currency ?? "USD";
        nextAmount = convertAmount(action.tx.amount, prevCur, nextAcc.currency);
        nextCurrency = nextAcc.currency;
      }
      nextAmount = round(nextAmount, nextCurrency);
      const tx: Transaction = { ...action.tx, amount: nextAmount, currency: nextCurrency };
      const accounts = state.accounts.map((a) => {
        let b = a.balance;
        if (a.id === prev.accountId) b -= prev.amount;
        if (a.id === tx.accountId) b += tx.amount;
        return { ...a, balance: round(b, a.currency) };
      });
      return {
        ...state,
        accounts,
        transactions: state.transactions.map((t) => (t.id === tx.id ? tx : t)),
      };
    }
    case "deleteTransaction": {
      const tx = state.transactions.find((t) => t.id === action.id);
      if (!tx) return state;
      const accounts = state.accounts.map((a) =>
        a.id === tx.accountId ? { ...a, balance: round(a.balance - tx.amount, a.currency) } : a,
      );
      return {
        ...state,
        accounts,
        transactions: state.transactions.filter((t) => t.id !== action.id),
      };
    }
    case "addAccount":
      return {
        ...state,
        accounts: [
          ...state.accounts,
          { ...action.account, balance: round(action.account.balance, action.account.currency) },
        ],
      };
    case "updateAccount": {
      const prev = state.accounts.find((a) => a.id === action.account.id);
      if (!prev) return state;
      const next = { ...action.account };
      const prevCur = (prev.currency ?? "USD") as CurrencyCode;
      const nextCur = (next.currency ?? "USD") as CurrencyCode;
      // Currency changed → re-denominate stored balance and all transactions
      // on this account into the new currency so aggregates stay correct.
      if (prevCur !== nextCur) {
        next.balance = round(convertAmount(next.balance, prevCur, nextCur), nextCur);
        const transactions = state.transactions.map((t) =>
          t.accountId === next.id
            ? {
                ...t,
                amount: round(
                  convertAmount(t.amount, (t.currency ?? prevCur) as CurrencyCode, nextCur),
                  nextCur,
                ),
                currency: nextCur,
              }
            : t,
        );
        const recurring = state.recurring.map((r) =>
          r.accountId === next.id
            ? {
                ...r,
                amount: round(
                  convertAmount(r.amount, (r.currency ?? prevCur) as CurrencyCode, nextCur),
                  nextCur,
                ),
                currency: nextCur,
              }
            : r,
        );
        // Subscriptions billed to this account are re-denominated too, so a
        // currency edit never leaves a linked charge in the old currency.
        const subscriptions = state.subscriptions.map((s) =>
          s.accountId === next.id
            ? {
                ...s,
                amount: round(
                  convertAmount(s.amount, (s.currency ?? prevCur) as CurrencyCode, nextCur),
                  nextCur,
                ),
                currency: nextCur,
              }
            : s,
        );
        return {
          ...state,
          accounts: state.accounts.map((a) => (a.id === next.id ? next : a)),
          transactions,
          recurring,
          subscriptions,
        };
      }
      next.balance = round(next.balance, nextCur);
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === next.id ? next : a)),
      };
    }
    case "deleteAccount": {
      const victim = state.accounts.find((a) => a.id === action.id);
      if (!victim) return state;
      const usage = accountUsage(state, action.id);
      const hasHistory = usage.transactions + usage.recurring + usage.subscriptions > 0;
      // Never silently destroy financial history: linked records must be
      // reassigned to another account first.
      if (hasHistory && !action.reassignTo) return state;
      if (!hasHistory && !action.reassignTo) {
        return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) };
      }
      const target = state.accounts.find((a) => a.id === action.reassignTo);
      if (!target || target.id === action.id) return state;
      const fromCur = accountCurrency(victim);
      const toCur = accountCurrency(target);
      const re = (amount: number, cur?: CurrencyCode) =>
        round(convertAmount(amount, (cur ?? fromCur) as CurrencyCode, toCur), toCur);
      // The account's CURRENT balance is the single source of truth for the
      // value being moved — transaction history is incomplete (opening
      // balances, imports, pre-history adjustments) and summing it would
      // silently change Net Worth. Convert exactly once, here.
      const movedBalance = round(convertAmount(victim.balance, fromCur, toCur), toCur);
      return {
        ...state,
        accounts: state.accounts
          .filter((a) => a.id !== action.id)
          .map((a) =>
            a.id === target.id ? { ...a, balance: round(a.balance + movedBalance, toCur) } : a,
          ),
        transactions: state.transactions.map((t) =>
          t.accountId === action.id
            ? { ...t, accountId: target.id, amount: re(t.amount, t.currency), currency: toCur }
            : t,
        ),
        recurring: state.recurring.map((r) =>
          r.accountId === action.id
            ? { ...r, accountId: target.id, amount: re(r.amount, r.currency), currency: toCur }
            : r,
        ),
        subscriptions: state.subscriptions.map((s) =>
          s.accountId === action.id
            ? { ...s, accountId: target.id, amount: re(s.amount, s.currency), currency: toCur }
            : s,
        ),
      };
    }
    case "addGoal":
      return { ...state, goals: [...state.goals, action.goal] };
    case "updateGoal":
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)),
      };
    case "deleteGoal":
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "contributeGoal": {
      const goal = state.goals.find((g) => g.id === action.id);
      if (!goal || !Number.isFinite(action.amount) || action.amount === 0) return state;
      const gCur = goalCurrency(goal);
      // Convert the entered amount into the goal's native currency exactly once.
      const inGoal = round(
        action.currency && action.currency !== gCur
          ? convertAmount(action.amount, action.currency, gCur)
          : action.amount,
        gCur,
      );
      // Never let a goal go negative — clamp the withdrawal to what is saved.
      const applied = round(Math.max(-goal.saved, inGoal), gCur);
      if (applied === 0) return state;
      const goals = state.goals.map((g) =>
        g.id === goal.id ? { ...g, saved: round(Math.max(0, g.saved + applied), gCur) } : g,
      );

      const acc = action.accountId
        ? state.accounts.find((a) => a.id === action.accountId)
        : undefined;
      if (!acc) return { ...state, goals };

      // Funding a goal moves real money: debit the account in its own currency
      // and log it as a transfer leg so spending stats stay clean.
      const accCur = accountCurrency(acc);
      const outAmt = round(convertAmount(applied, gCur, accCur), accCur);
      if (outAmt === 0) return { ...state, goals };
      const transferId = `goal_${goal.id}_${Date.now()}`;
      const tx: Transaction = {
        id: `t_${transferId}`,
        title: `${goal.emoji} ${goal.name}`,
        category: "transfer",
        amount: -outAmt,
        date: action.date ?? new Date().toISOString(),
        accountId: acc.id,
        currency: accCur,
        transferId,
        categoryLocked: true,
      };
      return {
        ...state,
        goals,
        accounts: state.accounts.map((a) =>
          a.id === acc.id ? { ...a, balance: round(a.balance - outAmt, accCur) } : a,
        ),
        transactions: [tx, ...state.transactions],
      };
    }
    case "setBudget": {
      const existing = state.budgets.find((b) => b.category === action.category);
      if (existing) {
        return {
          ...state,
          budgets: state.budgets.map((b) =>
            b.category === action.category
              ? { ...b, limit: action.limit, currency: action.currency }
              : b,
          ),
        };
      }
      return {
        ...state,
        budgets: [
          ...state.budgets,
          {
            id: `b_${Date.now()}`,
            category: action.category,
            limit: action.limit,
            currency: action.currency,
          },
        ],
      };
    }
    case "deleteBudget":
      return { ...state, budgets: state.budgets.filter((b) => b.id !== action.id) };
    case "addRecurring":
      return { ...state, recurring: [...state.recurring, action.rec] };
    case "deleteRecurring":
      return { ...state, recurring: state.recurring.filter((r) => r.id !== action.id) };
    case "setSettings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "addLiability":
      return { ...state, liabilities: [...state.liabilities, action.l] };
    case "updateLiability":
      return {
        ...state,
        liabilities: state.liabilities.map((l) => (l.id === action.l.id ? action.l : l)),
      };
    case "deleteLiability":
      return { ...state, liabilities: state.liabilities.filter((l) => l.id !== action.id) };
    case "addSubscription":
      return { ...state, subscriptions: [...state.subscriptions, action.s] };
    case "updateSubscription":
      return {
        ...state,
        subscriptions: state.subscriptions.map((s) => (s.id === action.s.id ? action.s : s)),
      };
    case "setSubscriptionStatus":
      return {
        ...state,
        subscriptions: state.subscriptions.map((s) =>
          s.id === action.id ? { ...s, status: action.status } : s,
        ),
      };
    case "deleteSubscription":
      return { ...state, subscriptions: state.subscriptions.filter((s) => s.id !== action.id) };
    case "toggleAutomation":
      return {
        ...state,
        automationRules: state.automationRules.map((r) =>
          r.id === action.id ? { ...r, enabled: !r.enabled } : r,
        ),
      };
    case "addAutomation":
      return { ...state, automationRules: [...state.automationRules, action.rule] };
    case "deleteAutomation":
      return {
        ...state,
        automationRules: state.automationRules.filter((r) => r.id !== action.id),
      };
    case "importTransactions": {
      const accountsMap = new Map(state.accounts.map((a) => [a.id, { ...a }]));
      const stamped: Transaction[] = [];
      for (const tx of action.txs) {
        const a = accountsMap.get(tx.accountId);
        if (!a) continue;
        const cur = (tx.currency ?? a.currency) as CurrencyCode | undefined;
        const amt = round(tx.amount, cur);
        const ruled = tx.categoryLocked ? null : resolveRuleCategory(state.categoryRules, tx);
        stamped.push({
          ...tx,
          category: ruled ?? tx.category,
          amount: amt,
          currency: cur ?? tx.currency,
        });
        a.balance = round(a.balance + amt, a.currency);
      }
      return {
        ...state,
        accounts: Array.from(accountsMap.values()),
        transactions: [...stamped, ...state.transactions],
      };
    }
    case "advanceRecurring": {
      const now = Date.now();
      const newTxs: Transaction[] = [];
      const updatedRecurring = state.recurring.map((r) => {
        let d = new Date(r.nextDate).getTime();
        let guard = 0;
        const accCur = state.accounts.find((a) => a.id === r.accountId)?.currency;
        const cur = r.currency ?? accCur;
        while (d <= now && guard < 60) {
          newTxs.push({
            id: `t_r_${r.id}_${d}_${guard}`,
            title: r.title,
            category: r.category,
            amount: round(r.amount, cur),
            date: new Date(d).toISOString(),
            accountId: r.accountId,
            recurringId: r.id,
            note: r.note,
            currency: cur,
          });
          const nd = new Date(d);
          if (r.frequency === "weekly") nd.setDate(nd.getDate() + 7);
          else if (r.frequency === "monthly") nd.setMonth(nd.getMonth() + 1);
          else nd.setFullYear(nd.getFullYear() + 1);
          d = nd.getTime();
          guard += 1;
        }
        return { ...r, nextDate: new Date(d).toISOString() };
      });
      if (newTxs.length === 0) return state;
      const accountsMap = new Map(state.accounts.map((a) => [a.id, { ...a }]));
      for (const tx of newTxs) {
        const a = accountsMap.get(tx.accountId);
        if (a) a.balance = round(a.balance + tx.amount, a.currency);
      }
      return {
        ...state,
        recurring: updatedRecurring,
        transactions: [...newTxs, ...state.transactions],
        accounts: Array.from(accountsMap.values()),
      };
    }
    case "transfer": {
      const from = state.accounts.find((a) => a.id === action.fromId);
      const to = state.accounts.find((a) => a.id === action.toId);
      if (!from || !to || from.id === to.id) return state;
      const fromCur = (from.currency ?? "USD") as CurrencyCode;
      const toCur = (to.currency ?? "USD") as CurrencyCode;
      const outAmt = round(Math.abs(action.amount), fromCur);
      if (outAmt <= 0) return state;
      // Convert exactly once, at transfer time.
      const inAmt = round(convertAmount(outAmt, fromCur, toCur), toCur);
      const transferId = `xfer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const date = action.date;
      const outTx: Transaction = {
        id: `t_${transferId}_o`,
        title: `Transfer to ${to.name}`,
        category: "transfer",
        amount: -outAmt,
        date,
        accountId: from.id,
        currency: fromCur,
        transferId,
        note: action.note,
      };
      const inTx: Transaction = {
        id: `t_${transferId}_i`,
        title: `Transfer from ${from.name}`,
        category: "transfer",
        amount: inAmt,
        date,
        accountId: to.id,
        currency: toCur,
        transferId,
        note: action.note,
      };
      const accounts = state.accounts.map((a) => {
        if (a.id === from.id) return { ...a, balance: round(a.balance - outAmt, fromCur) };
        if (a.id === to.id) return { ...a, balance: round(a.balance + inAmt, toCur) };
        return a;
      });
      return {
        ...state,
        accounts,
        transactions: [outTx, inTx, ...state.transactions],
      };
    }
    case "addCategoryRule":
      return { ...state, categoryRules: [...state.categoryRules, action.rule] };
    case "updateCategoryRule":
      return {
        ...state,
        categoryRules: state.categoryRules.map((r) =>
          r.id === action.rule.id ? { ...r, ...action.rule } : r,
        ),
      };
    case "deleteCategoryRule":
      return { ...state, categoryRules: state.categoryRules.filter((r) => r.id !== action.id) };
    case "toggleCategoryRule":
      return {
        ...state,
        categoryRules: state.categoryRules.map((r) =>
          r.id === action.id ? { ...r, enabled: !r.enabled } : r,
        ),
      };
    case "addCategory":
      return { ...state, categories: [...state.categories, action.c] };
    case "updateCategory":
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.c.id ? { ...c, ...action.c } : c)),
      };
    case "deleteCategory": {
      const cat = state.categories.find((c) => c.id === action.id);
      if (!cat || cat.builtin) return state;
      const inUse =
        state.transactions.some((t) => t.category === action.id) ||
        state.recurring.some((r) => r.category === action.id) ||
        state.subscriptions.some((s) => s.category === action.id) ||
        state.budgets.some((b) => b.category === action.id);
      if (inUse && !action.reassignTo) return state;
      const to = action.reassignTo;
      if (to && to !== action.id) {
        return {
          ...state,
          transactions: state.transactions.map((t) =>
            t.category === action.id ? { ...t, category: to } : t,
          ),
          recurring: state.recurring.map((r) =>
            r.category === action.id ? { ...r, category: to } : r,
          ),
          subscriptions: state.subscriptions.map((s) =>
            s.category === action.id ? { ...s, category: to } : s,
          ),
          budgets: state.budgets.map((b) =>
            b.category === action.id ? { ...b, category: to } : b,
          ),
          categories: state.categories.filter((c) => c.id !== action.id),
        };
      }
      return { ...state, categories: state.categories.filter((c) => c.id !== action.id) };
    }
    default:
      return state;
  }
}

/** Merge persisted user categories with any newly-added built-in defaults. */
/**
 * How many records reference an account. Used to block destructive deletes.
 */
export function accountUsage(state: NovaState, accountId: string) {
  return {
    transactions: state.transactions.filter((t) => t.accountId === accountId).length,
    recurring: state.recurring.filter((r) => r.accountId === accountId).length,
    subscriptions: state.subscriptions.filter((s) => s.accountId === accountId).length,
  };
}

function mergeCategories(persisted?: UserCategory[]): UserCategory[] {
  if (!persisted || persisted.length === 0) return defaultCategories;
  const byId = new Map(persisted.map((c) => [c.id, c]));
  for (const d of defaultCategories) if (!byId.has(d.id)) byId.set(d.id, d);
  return Array.from(byId.values());
}

type Ctx = {
  state: NovaState;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  updateTransaction: (tx: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (a: Omit<Account, "id">) => void;
  updateAccount: (a: Account) => void;
  deleteAccount: (id: string, reassignTo?: string) => void;
  accountUsageOf: (id: string) => { transactions: number; recurring: number; subscriptions: number };
  addGoal: (g: Omit<Goal, "id">) => void;
  updateGoal: (g: Goal) => void;
  deleteGoal: (id: string) => void;
  contributeGoal: (
    id: string,
    amount: number,
    opts?: { currency?: CurrencyCode; accountId?: string },
  ) => void;
  setBudget: (category: string, limit: number, currency?: CurrencyCode) => void;
  deleteBudget: (id: string) => void;
  addRecurring: (r: Omit<Recurring, "id">) => void;
  deleteRecurring: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  exportData: () => string;
  importData: (json: string) => boolean;
  addLiability: (l: Omit<Liability, "id">) => void;
  updateLiability: (l: Liability) => void;
  deleteLiability: (id: string) => void;
  addSubscription: (s: Omit<Subscription, "id">) => void;
  updateSubscription: (s: Subscription) => void;
  setSubscriptionStatus: (id: string, status: SubscriptionStatus) => void;
  deleteSubscription: (id: string) => void;
  toggleAutomation: (id: string) => void;
  addAutomation: (r: Omit<AutomationRule, "id">) => void;
  deleteAutomation: (id: string) => void;
  importTransactions: (txs: Omit<Transaction, "id">[]) => void;
  advanceRecurring: () => void;
  transfer: (args: { fromId: string; toId: string; amount: number; date?: string; note?: string }) => void;
  addCategory: (c: Omit<UserCategory, "id">) => void;
  updateCategory: (c: UserCategory) => void;
  deleteCategory: (id: string) => { ok: boolean; reason?: "builtin" | "in-use" };
  deleteCategoryWithReassign: (id: string, reassignTo: string) => { ok: boolean };
  addCategoryRule: (r: Omit<CategoryRule, "id">) => void;
  updateCategoryRule: (r: CategoryRule) => void;
  deleteCategoryRule: (id: string) => void;
  toggleCategoryRule: (id: string) => void;
};

const NovaContext = createContext<Ctx | null>(null);

export function NovaProvider({ children }: { children: ReactNode }) {
  // Start empty. Demo seed is applied only for guests, inside the hydration
  // effect below — an authenticated user must never see demo data.
  const [state, dispatch] = useReducer(reducer, emptyState);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const activeKeyRef = useRef<string>(keyFor(null));
  const hydratedRef = useRef<boolean>(false);
  const remoteSyncRef = useRef<boolean>(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load state for the active user (or guest).
  // - Guest: local demo seed.
  // - Authenticated: load from Supabase (`user_data.data`). If no row exists yet
  //   this is the user's first sign-in → create an empty row. Never wipe an
  //   existing row.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const key = keyFor(userId);
    activeKeyRef.current = key;
    hydratedRef.current = false;
    remoteSyncRef.current = false;

    if (!userId) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as NovaState;
          if (parsed?.accounts && parsed?.transactions) {
            dispatch({ type: "hydrate", state: parsed });
          } else {
            dispatch({ type: "hydrate", state: seed });
          }
        } else {
          dispatch({ type: "hydrate", state: seed });
        }
      } catch {
        dispatch({ type: "hydrate", state: seed });
      }
      hydratedRef.current = true;
      return;
    }

    // Optimistic hydrate from local cache to avoid flicker.
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as NovaState;
        if (parsed?.accounts && parsed?.transactions) {
          dispatch({ type: "hydrate", state: parsed });
        }
      }
    } catch {
      /* ignore */
    }

    (async () => {
      const { data, error } = await supabase
        .from("user_data")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[nova] load failed", error);
        hydratedRef.current = true;
        remoteSyncRef.current = true;
        return;
      }
      if (data?.data && typeof data.data === "object" && (data.data as NovaState).accounts) {
        dispatch({ type: "hydrate", state: data.data as NovaState });
      } else {
        // First-time registration: create empty row.
        dispatch({ type: "hydrate", state: emptyState });
        await supabase
          .from("user_data")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ user_id: userId, data: emptyState as any });
      }
      hydratedRef.current = true;
      remoteSyncRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(activeKeyRef.current, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    // Debounced remote persist for signed-in users.
    if (!remoteSyncRef.current || !userId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = state;
    const uid = userId;
    saveTimerRef.current = setTimeout(() => {
      supabase
        .from("user_data")
        .upsert(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { user_id: uid, data: snapshot as any },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) console.error("[nova] save failed", error);
        });
    }, 600);
  }, [state, userId]);

  // Daily Net Worth snapshot. Recomputed whenever accounts/liabilities change
  // and upserted under today's local date, so there is never more than one
  // snapshot per day. Transfers net to zero across accounts, so they cannot
  // move the recorded value.
  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    const snap = computeSnapshot(state);
    const list = state.netWorthHistory ?? [];
    const existing = list.find((s) => s.date === snap.date);
    if (sameSnapshot(existing, snap)) return;
    // Never fabricate history for a brand-new, completely empty account.
    if (list.length === 0 && state.accounts.length === 0 && state.liabilities.length === 0) return;
    dispatch({ type: "snapshotNetWorth", snap });
  }, [state]);

  const rid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const addTransaction = useCallback((tx: Omit<Transaction, "id">) => {
    dispatch({ type: "addTransaction", tx: { ...tx, id: rid("t") } });
  }, []);
  const updateTransaction = useCallback((tx: Transaction) => dispatch({ type: "updateTransaction", tx }), []);
  const deleteTransaction = useCallback((id: string) => dispatch({ type: "deleteTransaction", id }), []);
  const addAccount = useCallback(
    (a: Omit<Account, "id">) => dispatch({ type: "addAccount", account: { ...a, id: rid("a") } }),
    [],
  );
  const updateAccount = useCallback((a: Account) => dispatch({ type: "updateAccount", account: a }), []);
  const deleteAccount = useCallback(
    (id: string, reassignTo?: string) => dispatch({ type: "deleteAccount", id, reassignTo }),
    [],
  );
  const accountUsageOf = useCallback((id: string) => accountUsage(state, id), [state]);
  const addGoal = useCallback(
    (g: Omit<Goal, "id">) => dispatch({ type: "addGoal", goal: { ...g, id: rid("g") } }),
    [],
  );
  const updateGoal = useCallback((g: Goal) => dispatch({ type: "updateGoal", goal: g }), []);
  const deleteGoal = useCallback((id: string) => dispatch({ type: "deleteGoal", id }), []);
  const contributeGoal = useCallback(
    (id: string, amount: number, opts?: { currency?: CurrencyCode; accountId?: string }) =>
      dispatch({ type: "contributeGoal", id, amount, ...opts }),
    [],
  );
  const setBudget = useCallback(
    (category: string, limit: number, currency: CurrencyCode = "USD") =>
      dispatch({ type: "setBudget", category, limit, currency }),
    [],
  );
  const deleteBudget = useCallback((id: string) => dispatch({ type: "deleteBudget", id }), []);
  const addRecurring = useCallback(
    (r: Omit<Recurring, "id">) => dispatch({ type: "addRecurring", rec: { ...r, id: rid("r") } }),
    [],
  );
  const deleteRecurring = useCallback((id: string) => dispatch({ type: "deleteRecurring", id }), []);
  const setSettings = useCallback((patch: Partial<Settings>) => dispatch({ type: "setSettings", patch }), []);
  const exportData = useCallback(() => JSON.stringify(state, null, 2), [state]);
  const importData = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as NovaState;
      if (!parsed?.accounts || !parsed?.transactions) return false;
      dispatch({ type: "hydrate", state: parsed });
      return true;
    } catch {
      return false;
    }
  }, []);
  const addLiability = useCallback(
    (l: Omit<Liability, "id">) => dispatch({ type: "addLiability", l: { ...l, id: rid("l") } }),
    [],
  );
  const updateLiability = useCallback((l: Liability) => dispatch({ type: "updateLiability", l }), []);
  const deleteLiability = useCallback((id: string) => dispatch({ type: "deleteLiability", id }), []);
  const addSubscription = useCallback(
    (s: Omit<Subscription, "id">) => dispatch({ type: "addSubscription", s: { ...s, id: rid("s") } }),
    [],
  );
  const deleteSubscription = useCallback((id: string) => dispatch({ type: "deleteSubscription", id }), []);
  const updateSubscription = useCallback((s: Subscription) => dispatch({ type: "updateSubscription", s }), []);
  const setSubscriptionStatus = useCallback(
    (id: string, status: SubscriptionStatus) => dispatch({ type: "setSubscriptionStatus", id, status }),
    [],
  );
  const toggleAutomation = useCallback((id: string) => dispatch({ type: "toggleAutomation", id }), []);
  const addAutomation = useCallback(
    (r: Omit<AutomationRule, "id">) => dispatch({ type: "addAutomation", rule: { ...r, id: rid("ar") } }),
    [],
  );
  const deleteAutomation = useCallback((id: string) => dispatch({ type: "deleteAutomation", id }), []);
  const importTransactions = useCallback((txs: Omit<Transaction, "id">[]) => {
    const withIds = txs.map((t) => ({ ...t, id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }));
    dispatch({ type: "importTransactions", txs: withIds });
  }, []);
  const advanceRecurring = useCallback(() => dispatch({ type: "advanceRecurring" }), []);
  const transfer = useCallback(
    (args: { fromId: string; toId: string; amount: number; date?: string; note?: string }) =>
      dispatch({
        type: "transfer",
        fromId: args.fromId,
        toId: args.toId,
        amount: args.amount,
        date: args.date ?? new Date().toISOString(),
        note: args.note,
      }),
    [],
  );
  const addCategory = useCallback(
    (c: Omit<UserCategory, "id">) => dispatch({ type: "addCategory", c: { ...c, id: rid("cat") } }),
    [],
  );
  const updateCategory = useCallback((c: UserCategory) => dispatch({ type: "updateCategory", c }), []);
  const deleteCategoryImpl = useCallback(
    (id: string): { ok: boolean; reason?: "builtin" | "in-use" } => {
      const cur = state;
      const cat = cur.categories.find((c) => c.id === id);
      if (!cat) return { ok: false };
      if (cat.builtin) return { ok: false, reason: "builtin" };
      const inUse =
        cur.transactions.some((t) => t.category === id) ||
        cur.recurring.some((r) => r.category === id) ||
        cur.subscriptions.some((s) => s.category === id) ||
        cur.budgets.some((b) => b.category === id);
      if (inUse) return { ok: false, reason: "in-use" };
      dispatch({ type: "deleteCategory", id });
      return { ok: true };
    },
    [state],
  );
  const deleteCategoryWithReassign = useCallback(
    (id: string, reassignTo: string): { ok: boolean } => {
      const cat = state.categories.find((c) => c.id === id);
      if (!cat || cat.builtin) return { ok: false };
      dispatch({ type: "deleteCategory", id, reassignTo });
      return { ok: true };
    },
    [state.categories],
  );

  const addCategoryRule = useCallback(
    (r: Omit<CategoryRule, "id">) =>
      dispatch({ type: "addCategoryRule", rule: { ...r, id: rid("cr") } }),
    [],
  );
  const updateCategoryRule = useCallback(
    (r: CategoryRule) => dispatch({ type: "updateCategoryRule", rule: r }),
    [],
  );
  const deleteCategoryRule = useCallback((id: string) => dispatch({ type: "deleteCategoryRule", id }), []);
  const toggleCategoryRule = useCallback((id: string) => dispatch({ type: "toggleCategoryRule", id }), []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      deleteAccount,
      accountUsageOf,
      addGoal,
      updateGoal,
      deleteGoal,
      contributeGoal,
      setBudget,
      deleteBudget,
      addRecurring,
      deleteRecurring,
      setSettings,
      exportData,
      importData,
      addLiability,
      updateLiability,
      deleteLiability,
      addSubscription,
      deleteSubscription,
      toggleAutomation,
      updateSubscription,
      setSubscriptionStatus,
      addAutomation,
      deleteAutomation,
      importTransactions,
      advanceRecurring,
      transfer,
      addCategory,
      updateCategory,
      deleteCategory: deleteCategoryImpl,
      deleteCategoryWithReassign,
      addCategoryRule,
      updateCategoryRule,
      deleteCategoryRule,
      toggleCategoryRule,
    }),
    [
      state,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      deleteAccount,
      accountUsageOf,
      addGoal,
      updateGoal,
      deleteGoal,
      contributeGoal,
      setBudget,
      deleteBudget,
      addRecurring,
      deleteRecurring,
      setSettings,
      exportData,
      importData,
      addLiability,
      updateLiability,
      deleteLiability,
      addSubscription,
      deleteSubscription,
      toggleAutomation,
      addAutomation,
      deleteAutomation,
      importTransactions,
      advanceRecurring,
      transfer,
      addCategory,
      updateCategory,
      deleteCategoryImpl,
      updateSubscription,
      setSubscriptionStatus,
      deleteCategoryWithReassign,
      addCategoryRule,
      updateCategoryRule,
      deleteCategoryRule,
      toggleCategoryRule,
    ],
  );


  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}

export function useNova() {
  const ctx = useContext(NovaContext);
  if (!ctx) throw new Error("useNova must be used inside NovaProvider");
  return ctx;
}

/**
 * Returns the account's native currency (falls back to USD for legacy rows).
 */
export function accountCurrency(a: Account | undefined): CurrencyCode {
  return (a?.currency ?? "USD") as CurrencyCode;
}

/**
 * Returns a transaction's native currency (mirrors its account if unset).
 */
export function txCurrency(t: Transaction, accounts: Account[]): CurrencyCode {
  if (t.currency) return t.currency;
  const a = accounts.find((x) => x.id === t.accountId);
  return accountCurrency(a);
}

/**
 * View of the store where every monetary field has been converted to the
 * active display currency. Use for cross-account aggregates (Home totals,
 * Net Worth, Stats). Per-item native rendering should still use raw state
 * from `useNova()` + `formatIn(amount, nativeCurrency)`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDisplayState() {
  const { state } = useNova();
  const { currency } = useCurrency();
  return useMemo(() => {
    const to = currency.code as CurrencyCode;
    const conv = (n: number, from: CurrencyCode) => convertAmount(n, from, to);
    const accCur = new Map<string, CurrencyCode>();
    for (const a of state.accounts) accCur.set(a.id, accountCurrency(a));
    return {
      ...state,
      accounts: state.accounts.map((a) => ({
        ...a,
        balance: conv(a.balance, accountCurrency(a)),
      })),
      transactions: state.transactions.map((t) => ({
        ...t,
        amount: conv(t.amount, t.currency ?? accCur.get(t.accountId) ?? "USD"),
      })),
      recurring: state.recurring.map((r) => ({
        ...r,
        amount: conv(r.amount, r.currency ?? accCur.get(r.accountId) ?? "USD"),
      })),
      // Liabilities are stored in their own native currency and converted
      // exactly once, here, for Net Worth math (Assets − Liabilities).
      liabilities: state.liabilities.map((l) => ({
        ...l,
        balance: conv(l.balance, liabilityCurrency(l)),
        currency: to,
      })),
      subscriptions: state.subscriptions.map((s) => ({
        ...s,
        amount: conv(s.amount, s.currency ?? accCur.get(s.accountId ?? "") ?? "USD"),
        currency: to,
      })),
      // Budget limits carry a native currency and are converted exactly once
      // here, so warnings, the health score and Insights all compare like
      // with like against converted spend.
      budgets: state.budgets.map((b) => ({
        ...b,
        limit: conv(b.limit, budgetCurrency(b)),
        currency: to,
      })),
      // Goals also carry a native currency: convert once so progress bars,
      // totals and the health score compare like with like.
      goals: state.goals.map((g) => {
        const from = goalCurrency(g);
        return {
          ...g,
          saved: conv(g.saved, from),
          target: conv(g.target, from),
          monthly: g.monthly === undefined ? undefined : conv(g.monthly, from),
          currency: to,
        };
      }),
    };
  }, [state, currency.code]);
}

export type Bucket = "Today" | "Yesterday" | "Earlier";

export function bucketOf(iso: string): Bucket {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const ts = d.getTime();
  if (ts >= startToday) return "Today";
  if (ts >= startToday - day) return "Yesterday";
  return "Earlier";
}

export type DateLabels = { today: string; yesterday: string; locale: string };

const DEFAULT_DATE_LABELS: DateLabels = {
  today: "Today",
  yesterday: "Yesterday",
  locale: "en-US",
};

export function formatTxDate(isoStr: string, labels: DateLabels = DEFAULT_DATE_LABELS): string {
  const d = new Date(isoStr);
  const b = bucketOf(isoStr);
  const time = d.toLocaleTimeString(labels.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (b === "Today") return `${labels.today} · ${time}`;
  if (b === "Yesterday") return `${labels.yesterday} · ${time}`;
  return d.toLocaleDateString(labels.locale, { month: "short", day: "numeric" }) + " · " + time;
}

export function groupByBucket(txs: Transaction[]): { bucket: Bucket; items: Transaction[] }[] {
  const groups: Record<Bucket, Transaction[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const t of txs) groups[bucketOf(t.date)].push(t);
  const order: Bucket[] = ["Today", "Yesterday", "Earlier"];
  return order
    .filter((b) => groups[b].length > 0)
    .map((bucket) => ({
      bucket,
      items: groups[bucket].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    }));
}

export function monthlyTotals(txs: Transaction[]) {
  const now = new Date();
  let income = 0;
  let expenses = 0;
  for (const t of txs) {
    const d = new Date(t.date);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      if (t.amount > 0) income += t.amount;
      else expenses += -t.amount;
    }
  }
  return { income, expenses };
}

export function totalBalance(accounts: Account[]) {
  return accounts.reduce((s, a) => s + a.balance, 0);
}

export function savingsRate(income: number, expenses: number) {
  if (income <= 0) return 0;
  return Math.max(0, Math.min(1, (income - expenses) / income));
}

export function monthlySpendByCategory(txs: Transaction[]) {
  const now = new Date();
  const map: Record<string, number> = {};
  for (const t of txs) {
    const d = new Date(t.date);
    if (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      t.amount < 0
    ) {
      map[t.category] = (map[t.category] ?? 0) + -t.amount;
    }
  }
  return map;
}

export function filterTxsByRange(txs: Transaction[], range: "week" | "month" | "year") {
  const now = new Date();
  const start = new Date(now);
  if (range === "week") start.setDate(now.getDate() - 6);
  else if (range === "month") start.setDate(1);
  else start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  return txs.filter((t) => new Date(t.date) >= start);
}

export function cashflowByRange(
  txs: Transaction[],
  range: "week" | "month" | "year",
  locale = "en-US",
) {
  const now = new Date();
  if (range === "week") {
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    return days.map((d) => {
      const label = d.toLocaleDateString(locale, { weekday: "short" });
      let income = 0;
      let expense = 0;
      for (const t of txs) {
        const td = new Date(t.date);
        if (td.toDateString() === d.toDateString()) {
          if (t.amount > 0) income += t.amount;
          else expense += -t.amount;
        }
      }
      return { m: label, income, expense };
    });
  }
  if (range === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const buckets = Array.from({ length: Math.ceil(daysInMonth / 5) }).map((_, i) => ({
      m: `${i * 5 + 1}`,
      income: 0,
      expense: 0,
    }));
    for (const t of txs) {
      const td = new Date(t.date);
      if (td.getFullYear() === now.getFullYear() && td.getMonth() === now.getMonth()) {
        const idx = Math.min(buckets.length - 1, Math.floor((td.getDate() - 1) / 5));
        if (t.amount > 0) buckets[idx].income += t.amount;
        else buckets[idx].expense += -t.amount;
      }
    }
    return buckets;
  }
  const months = Array.from({ length: 12 }).map((_, i) => ({
    m: new Date(now.getFullYear(), i, 1).toLocaleDateString(locale, { month: "short" }),
    income: 0,
    expense: 0,
  }));
  for (const t of txs) {
    const td = new Date(t.date);
    if (td.getFullYear() === now.getFullYear()) {
      if (t.amount > 0) months[td.getMonth()].income += t.amount;
      else months[td.getMonth()].expense += -t.amount;
    }
  }
  return months;
}

export function estimateGoalETA(
  goal: Goal,
  labels: { achieved: string; locale: string } = { achieved: "Achieved 🎉", locale: "en-US" },
): string {
  if (goal.saved >= goal.target) return labels.achieved;
  const monthly = goal.monthly && goal.monthly > 0 ? goal.monthly : 0;
  if (!monthly) return goal.eta;
  const remaining = goal.target - goal.saved;
  const months = Math.ceil(remaining / monthly);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString(labels.locale, { month: "short", year: "numeric" });
}

/** i18n key for an account type, e.g. `acct.type.bank`. */
export function accountTypeKey(t: AccountType): string {
  return `acct.type.${t}`;
}

export function accountTypeLabel(t: AccountType, tr?: (k: string) => string): string {
  if (tr) {
    const key = accountTypeKey(t);
    const v = tr(key);
    if (v !== key) return v;
  }
  return { cash: "Cash", bank: "Bank", revolut: "Revolut", trading: "Trading", crypto: "Crypto" }[t];
}

export function totalLiabilities(ls: Liability[]) {
  return ls.reduce((s, l) => s + l.balance, 0);
}

/**
 * Today's Net Worth snapshot computed from RAW state (native currencies),
 * converted exactly once into the USD snapshot base.
 */
export function computeSnapshot(state: NovaState): NetWorthSnapshot {
  const assets = state.accounts.reduce(
    (s, a) => s + convertAmount(a.balance, accountCurrency(a), SNAPSHOT_BASE),
    0,
  );
  const liabilities = state.liabilities.reduce(
    (s, l) => s + convertAmount(l.balance, liabilityCurrency(l), SNAPSHOT_BASE),
    0,
  );
  return {
    date: dayKey(),
    assets,
    liabilities,
    net: assets - liabilities,
    base: SNAPSHOT_BASE,
  };
}

export function netWorthBreakdown(state: NovaState) {
  const cash = state.accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0);
  const bank = state.accounts.filter((a) => a.type === "bank" || a.type === "revolut").reduce((s, a) => s + a.balance, 0);
  const invest = state.accounts.filter((a) => a.type === "trading").reduce((s, a) => s + a.balance, 0);
  const crypto = state.accounts.filter((a) => a.type === "crypto").reduce((s, a) => s + a.balance, 0);
  const assets = cash + bank + invest + crypto;
  const loans = state.liabilities.filter((l) => l.type === "loan").reduce((s, l) => s + l.balance, 0);
  const cards = state.liabilities.filter((l) => l.type === "credit_card").reduce((s, l) => s + l.balance, 0);
  const mortgage = state.liabilities.filter((l) => l.type === "mortgage").reduce((s, l) => s + l.balance, 0);
  const liab = loans + cards + mortgage;
  return { cash, bank, invest, crypto, assets, loans, cards, mortgage, liab, net: assets - liab };
}

export function subscriptionsMonthlyTotal(subs: Subscription[]) {
  return subs.reduce((s, x) => s + subscriptionMonthlyAmount(x), 0);
}

/** Cost of one subscription normalized to a month, in its own native currency. */
export function subscriptionMonthlyAmount(s: Subscription) {
  switch (s.frequency ?? "monthly") {
    case "weekly":
      return (s.amount * 52) / 12;
    case "quarterly":
      return s.amount / 3;
    case "yearly":
      return s.amount / 12;
    default:
      return s.amount;
  }
}

/**
 * Monthly / yearly totals of the given subscriptions, converted into `to`
 * for display only. Native amounts are never mutated.
 */
export function subscriptionTotals(
  subs: Subscription[],
  to: CurrencyCode,
  fallback: CurrencyCode = "USD",
) {
  const monthly = subs.reduce(
    (sum, s) => sum + convertAmount(subscriptionMonthlyAmount(s), s.currency ?? fallback, to),
    0,
  );
  return { monthly, yearly: monthly * 12 };
}

/**
 * Dynamic Financial Health Score (0–1000).
 * Recomputes from live state — savings rate, debt ratio, emergency fund,
 * goal progress, budget performance, and positive net worth trend.
 */
export type ScoreStatus = "excellent" | "good" | "fair" | "needsWork" | "gettingStarted";

export type ScoreChip = { key: string; params?: Record<string, string | number> };

export type ScoreBreakdown = {
  score: number;
  /** i18n key, e.g. `score.status.good`. */
  statusKey: string;
  status: ScoreStatus;
  /** i18n key, e.g. `score.explain.good`. */
  explanationKey: string;
  explanationParams?: Record<string, string | number>;
  chips: ScoreChip[];
};

export function computeFinancialScore(display: NovaState): ScoreBreakdown {
  const { income, expenses } = monthlyTotals(display.transactions);
  const nb = netWorthBreakdown(display);

  const hasActivity =
    display.accounts.length > 0 || display.transactions.length > 0 || display.goals.length > 0;
  if (!hasActivity) {
    return {
      score: 0,
      status: "gettingStarted",
      statusKey: "score.status.gettingStarted",
      explanationKey: "score.explain.gettingStarted",
      chips: [{ key: "score.chip.noData" }],
    };
  }

  // 1. Savings rate — 30%
  const sr = savingsRate(income, expenses); // 0..1
  const srPts = Math.min(1, sr / 0.3) * 300;

  // 2. Debt ratio (liab vs assets) — 20% (lower is better)
  const debtRatio = nb.assets > 0 ? nb.liab / nb.assets : nb.liab > 0 ? 1 : 0;
  const debtPts = Math.max(0, 1 - Math.min(1, debtRatio)) * 200;

  // 3. Emergency fund (cash+bank vs 3 months expenses) — 15%
  const target = Math.max(1, expenses * 3);
  const liquid = nb.cash + nb.bank;
  const efPts = Math.max(0, Math.min(1, liquid / target)) * 150;

  // 4. Goal progress — 15%
  const goalPct = display.goals.length
    ? display.goals.reduce(
        (s, g) => s + Math.max(0, Math.min(1, g.target > 0 ? g.saved / g.target : 0)),
        0,
      ) / display.goals.length
    : 0;
  const goalPts = goalPct * 150;

  // 5. Budget performance — 15%
  const spendByCat = monthlySpendByCategory(display.transactions);
  let budgetPts = 150;
  if (display.budgets.length) {
    const ratios = display.budgets.map((b) => {
      const spent = spendByCat[b.category] ?? 0;
      return b.limit > 0 ? spent / b.limit : 0;
    });
    const avgUsage = ratios.reduce((s, x) => s + x, 0) / ratios.length;
    // 0-80% used = full points; 100% = half; >150% = 0.
    budgetPts = Math.max(0, 1 - Math.max(0, avgUsage - 0.8) / 0.7) * 150;
  }

  // 6. Positive net worth — 5%
  const nwPts = nb.net > 0 ? 50 : nb.net === 0 ? 25 : 0;

  const score = Math.round(srPts + debtPts + efPts + goalPts + budgetPts + nwPts);

  const status: ScoreStatus =
    score >= 800 ? "excellent" : score >= 650 ? "good" : score >= 450 ? "fair" : "needsWork";
  const statusKey = `score.status.${status}`;

  const pct = Math.round(sr * 100);
  const chips: ScoreChip[] = [];
  if (sr >= 0.2) chips.push({ key: "score.chip.saves", params: { pct } });
  if (debtRatio < 0.35 && nb.liab > 0) chips.push({ key: "score.chip.lowDebt" });
  if (liquid >= target) chips.push({ key: "score.chip.emergencyFund" });
  if (goalPct >= 0.5) chips.push({ key: "score.chip.goalsOnTrack" });
  if (budgetPts >= 120 && display.budgets.length) chips.push({ key: "score.chip.onBudget" });
  if (chips.length === 0) chips.push({ key: statusKey });

  const explanationKey =
    score >= 800
      ? "score.explain.excellent"
      : score >= 650
        ? "score.explain.good"
        : score >= 450
          ? "score.explain.fair"
          : income === 0
            ? "score.explain.noIncome"
            : "score.explain.needsWork";

  return { score, status, statusKey, explanationKey, explanationParams: { pct }, chips };
}