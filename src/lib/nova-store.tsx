import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

export type Account = {
  id: string;
  name: string;
  number: string;
  holder: string;
  balance: number;
  gradient: string;
  brand: string;
};

export type Transaction = {
  id: string;
  title: string;
  category: string;
  amount: number; // negative = expense
  date: string; // ISO string
  accountId: string;
  note?: string;
};

export type Goal = {
  id: string;
  name: string;
  saved: number;
  target: number;
  emoji: string;
  eta: string;
};

export type Budget = {
  id: string;
  category: string;
  limit: number;
};

export type NovaState = {
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  budgets: Budget[];
};

const STORAGE_KEY = "nova.store.v1";

function iso(daysAgo: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
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
    },
    {
      id: "c2",
      name: "NOVA Savings",
      number: "•••• 7712",
      holder: "A. MORGAN",
      balance: 3540.43,
      gradient: "var(--gradient-accent)",
      brand: "Mastercard",
    },
    {
      id: "c3",
      name: "NOVA Travel",
      number: "•••• 0293",
      holder: "A. MORGAN",
      balance: 520.0,
      gradient: "linear-gradient(135deg, oklch(0.35 0.12 200), oklch(0.25 0.1 260))",
      brand: "Visa",
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
    { id: "g1", name: "Emergency Fund", saved: 4200, target: 10000, emoji: "🛟", eta: "Dec 2026" },
    { id: "g2", name: "Tokyo Trip", saved: 1830, target: 3500, emoji: "🗼", eta: "Mar 2027" },
    { id: "g3", name: "New MacBook", saved: 940, target: 2500, emoji: "💻", eta: "Sep 2026" },
    { id: "g4", name: "Down Payment", saved: 12400, target: 60000, emoji: "🏡", eta: "2029" },
  ],
  budgets: [
    { id: "b1", category: "food", limit: 800 },
    { id: "b2", category: "shopping", limit: 500 },
    { id: "b3", category: "transport", limit: 250 },
    { id: "b4", category: "entertainment", limit: 200 },
  ],
};

type Action =
  | { type: "hydrate"; state: NovaState }
  | { type: "addTransaction"; tx: Transaction }
  | { type: "deleteTransaction"; id: string };

function reducer(state: NovaState, action: Action): NovaState {
  switch (action.type) {
    case "hydrate":
      return action.state;
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
    default:
      return state;
  }
}

type Ctx = {
  state: NovaState;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  deleteTransaction: (id: string) => void;
};

const NovaContext = createContext<Ctx | null>(null);

export function NovaProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, seed);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as NovaState;
        if (parsed && parsed.accounts && parsed.transactions) {
          dispatch({ type: "hydrate", state: parsed });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      /* ignore */
    }
  }, [state]);

  const addTransaction = useCallback((tx: Omit<Transaction, "id">) => {
    dispatch({
      type: "addTransaction",
      tx: { ...tx, id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
    });
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    dispatch({ type: "deleteTransaction", id });
  }, []);

  const value = useMemo(
    () => ({ state, addTransaction, deleteTransaction }),
    [state, addTransaction, deleteTransaction],
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