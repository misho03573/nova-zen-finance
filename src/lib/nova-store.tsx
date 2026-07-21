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
};

export type Goal = {
  id: string;
  name: string;
  saved: number;
  target: number;
  emoji: string;
  eta: string;
  monthly?: number;
};

export type Budget = {
  id: string;
  category: string;
  limit: number;
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
};

export type LiabilityType = "loan" | "credit_card" | "mortgage";
export type Liability = {
  id: string;
  name: string;
  type: LiabilityType;
  balance: number; // amount owed, positive number
  apr?: number;
  minPayment?: number;
};

export type Subscription = {
  id: string;
  name: string;
  amount: number; // monthly cost, positive
  category: string;
  nextDate: string;
  color: string;
  emoji: string;
};

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
    { id: "l1", name: "Student Loan", type: "loan", balance: 12400, apr: 4.5, minPayment: 220 },
    { id: "l2", name: "Amex Platinum", type: "credit_card", balance: 1840, apr: 21.9, minPayment: 60 },
    { id: "l3", name: "Mortgage", type: "mortgage", balance: 184000, apr: 3.2, minPayment: 1250 },
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
};

type Action =
  | { type: "hydrate"; state: NovaState }
  | { type: "addTransaction"; tx: Transaction }
  | { type: "updateTransaction"; tx: Transaction }
  | { type: "deleteTransaction"; id: string }
  | { type: "addAccount"; account: Account }
  | { type: "updateAccount"; account: Account }
  | { type: "deleteAccount"; id: string }
  | { type: "addGoal"; goal: Goal }
  | { type: "updateGoal"; goal: Goal }
  | { type: "deleteGoal"; id: string }
  | { type: "contributeGoal"; id: string; amount: number }
  | { type: "setBudget"; category: string; limit: number }
  | { type: "deleteBudget"; id: string }
  | { type: "addRecurring"; rec: Recurring }
  | { type: "deleteRecurring"; id: string }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "addLiability"; l: Liability }
  | { type: "updateLiability"; l: Liability }
  | { type: "deleteLiability"; id: string }
  | { type: "addSubscription"; s: Subscription }
  | { type: "deleteSubscription"; id: string }
  | { type: "toggleAutomation"; id: string }
  | { type: "addAutomation"; rule: AutomationRule }
  | { type: "deleteAutomation"; id: string }
  | { type: "importTransactions"; txs: Transaction[] }
  | { type: "advanceRecurring" };

function reducer(state: NovaState, action: Action): NovaState {
  switch (action.type) {
    case "hydrate":
      return {
        ...seed,
        ...action.state,
        settings: { ...seed.settings, ...action.state.settings },
        liabilities: action.state.liabilities ?? seed.liabilities,
        subscriptions: action.state.subscriptions ?? seed.subscriptions,
        automationRules: action.state.automationRules ?? seed.automationRules,
      };
    case "addTransaction": {
      const accounts = state.accounts.map((a) =>
        a.id === action.tx.accountId ? { ...a, balance: a.balance + action.tx.amount } : a,
      );
      return {
        ...state,
        accounts,
        transactions: [action.tx, ...state.transactions],
      };
    }
    case "updateTransaction": {
      const prev = state.transactions.find((t) => t.id === action.tx.id);
      if (!prev) return state;
      const accounts = state.accounts.map((a) => {
        let b = a.balance;
        if (a.id === prev.accountId) b -= prev.amount;
        if (a.id === action.tx.accountId) b += action.tx.amount;
        return { ...a, balance: b };
      });
      return {
        ...state,
        accounts,
        transactions: state.transactions.map((t) => (t.id === action.tx.id ? action.tx : t)),
      };
    }
    case "deleteTransaction": {
      const tx = state.transactions.find((t) => t.id === action.id);
      if (!tx) return state;
      const accounts = state.accounts.map((a) =>
        a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a,
      );
      return {
        ...state,
        accounts,
        transactions: state.transactions.filter((t) => t.id !== action.id),
      };
    }
    case "addAccount":
      return { ...state, accounts: [...state.accounts, action.account] };
    case "updateAccount":
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)),
      };
    case "deleteAccount":
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== action.id),
        transactions: state.transactions.filter((t) => t.accountId !== action.id),
        recurring: state.recurring.filter((r) => r.accountId !== action.id),
      };
    case "addGoal":
      return { ...state, goals: [...state.goals, action.goal] };
    case "updateGoal":
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)),
      };
    case "deleteGoal":
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) };
    case "contributeGoal":
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.id ? { ...g, saved: Math.max(0, g.saved + action.amount) } : g,
        ),
      };
    case "setBudget": {
      const existing = state.budgets.find((b) => b.category === action.category);
      if (existing) {
        return {
          ...state,
          budgets: state.budgets.map((b) =>
            b.category === action.category ? { ...b, limit: action.limit } : b,
          ),
        };
      }
      return {
        ...state,
        budgets: [
          ...state.budgets,
          { id: `b_${Date.now()}`, category: action.category, limit: action.limit },
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
      for (const tx of action.txs) {
        const a = accountsMap.get(tx.accountId);
        if (a) a.balance += tx.amount;
      }
      return {
        ...state,
        accounts: Array.from(accountsMap.values()),
        transactions: [...action.txs, ...state.transactions],
      };
    }
    case "advanceRecurring": {
      const now = Date.now();
      const newTxs: Transaction[] = [];
      const updatedRecurring = state.recurring.map((r) => {
        let d = new Date(r.nextDate).getTime();
        let guard = 0;
        while (d <= now && guard < 60) {
          newTxs.push({
            id: `t_r_${r.id}_${d}_${guard}`,
            title: r.title,
            category: r.category,
            amount: r.amount,
            date: new Date(d).toISOString(),
            accountId: r.accountId,
            recurringId: r.id,
            note: r.note,
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
        if (a) a.balance += tx.amount;
      }
      return {
        ...state,
        recurring: updatedRecurring,
        transactions: [...newTxs, ...state.transactions],
        accounts: Array.from(accountsMap.values()),
      };
    }
    default:
      return state;
  }
}

type Ctx = {
  state: NovaState;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  updateTransaction: (tx: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (a: Omit<Account, "id">) => void;
  updateAccount: (a: Account) => void;
  deleteAccount: (id: string) => void;
  addGoal: (g: Omit<Goal, "id">) => void;
  updateGoal: (g: Goal) => void;
  deleteGoal: (id: string) => void;
  contributeGoal: (id: string, amount: number) => void;
  setBudget: (category: string, limit: number) => void;
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
  deleteSubscription: (id: string) => void;
  toggleAutomation: (id: string) => void;
  addAutomation: (r: Omit<AutomationRule, "id">) => void;
  deleteAutomation: (id: string) => void;
  importTransactions: (txs: Omit<Transaction, "id">[]) => void;
  advanceRecurring: () => void;
};

const NovaContext = createContext<Ctx | null>(null);

export function NovaProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, seed);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const activeKeyRef = useRef<string>(keyFor(null));
  const hydratedRef = useRef<boolean>(false);

  // Load state for the active user (or guest). On first sign-in, migrate guest data.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = keyFor(userId);
    try {
      let raw = window.localStorage.getItem(key);
      // Migration: signing in for the first time with local guest data.
      if (userId && !raw) {
        const guest = window.localStorage.getItem(GUEST_KEY);
        if (guest) {
          window.localStorage.setItem(key, guest);
          raw = guest;
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw) as NovaState;
        if (parsed && parsed.accounts && parsed.transactions) {
          dispatch({ type: "hydrate", state: parsed });
        } else {
          dispatch({ type: "hydrate", state: seed });
        }
      } else {
        // New account, no data → start from seed.
        dispatch({ type: "hydrate", state: seed });
      }
    } catch {
      /* ignore */
    }
    activeKeyRef.current = key;
    hydratedRef.current = true;
  }, [userId]);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(activeKeyRef.current, JSON.stringify(state));
    } catch {
      /* ignore */
    }
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
  const deleteAccount = useCallback((id: string) => dispatch({ type: "deleteAccount", id }), []);
  const addGoal = useCallback(
    (g: Omit<Goal, "id">) => dispatch({ type: "addGoal", goal: { ...g, id: rid("g") } }),
    [],
  );
  const updateGoal = useCallback((g: Goal) => dispatch({ type: "updateGoal", goal: g }), []);
  const deleteGoal = useCallback((id: string) => dispatch({ type: "deleteGoal", id }), []);
  const contributeGoal = useCallback(
    (id: string, amount: number) => dispatch({ type: "contributeGoal", id, amount }),
    [],
  );
  const setBudget = useCallback(
    (category: string, limit: number) => dispatch({ type: "setBudget", category, limit }),
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

  const value = useMemo<Ctx>(
    () => ({
      state,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      deleteAccount,
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
    }),
    [
      state,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount,
      deleteAccount,
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
    ],
  );

  return <NovaContext.Provider value={value}>{children}</NovaContext.Provider>;
}

export function useNova() {
  const ctx = useContext(NovaContext);
  if (!ctx) throw new Error("useNova must be used inside NovaProvider");
  return ctx;
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

export function formatTxDate(isoStr: string): string {
  const d = new Date(isoStr);
  const b = bucketOf(isoStr);
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (b === "Today") return `Today · ${time}`;
  if (b === "Yesterday") return `Yesterday · ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + time;
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

export function cashflowByRange(txs: Transaction[], range: "week" | "month" | "year") {
  const now = new Date();
  if (range === "week") {
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    return days.map((d) => {
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
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
    m: new Date(now.getFullYear(), i, 1).toLocaleDateString("en-US", { month: "short" }),
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

export function estimateGoalETA(goal: Goal): string {
  if (goal.saved >= goal.target) return "Achieved 🎉";
  const monthly = goal.monthly && goal.monthly > 0 ? goal.monthly : 0;
  if (!monthly) return goal.eta;
  const remaining = goal.target - goal.saved;
  const months = Math.ceil(remaining / monthly);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function accountTypeLabel(t: AccountType): string {
  return { cash: "Cash", bank: "Bank", revolut: "Revolut", trading: "Trading", crypto: "Crypto" }[t];
}

export function totalLiabilities(ls: Liability[]) {
  return ls.reduce((s, l) => s + l.balance, 0);
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
  return subs.reduce((s, x) => s + x.amount, 0);
}