import {
  Coffee,
  ShoppingBag,
  Car,
  Home,
  Utensils,
  Plane,
  Music,
  Zap,
  Briefcase,
  Gift,
  type LucideIcon,
} from "lucide-react";

export type Category = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
};

export const categories: Category[] = [
  { id: "food", name: "Food", icon: Utensils, color: "oklch(0.7 0.19 30)" },
  { id: "coffee", name: "Coffee", icon: Coffee, color: "oklch(0.72 0.14 60)" },
  { id: "shopping", name: "Shopping", icon: ShoppingBag, color: "oklch(0.65 0.2 300)" },
  { id: "transport", name: "Transport", icon: Car, color: "oklch(0.72 0.15 240)" },
  { id: "rent", name: "Rent", icon: Home, color: "oklch(0.75 0.12 200)" },
  { id: "travel", name: "Travel", icon: Plane, color: "oklch(0.78 0.16 180)" },
  { id: "entertainment", name: "Fun", icon: Music, color: "oklch(0.7 0.2 340)" },
  { id: "bills", name: "Bills", icon: Zap, color: "oklch(0.82 0.17 80)" },
  { id: "salary", name: "Salary", icon: Briefcase, color: "oklch(0.82 0.18 155)" },
  { id: "gift", name: "Gift", icon: Gift, color: "oklch(0.75 0.18 15)" },
];

export type Transaction = {
  id: string;
  title: string;
  category: string;
  amount: number; // negative = expense
  date: string;
  merchant?: string;
};

export const transactions: Transaction[] = [
  { id: "t1", title: "Blue Bottle Coffee", category: "coffee", amount: -6.5, date: "Today · 09:12", merchant: "Blue Bottle" },
  { id: "t2", title: "Whole Foods", category: "food", amount: -84.32, date: "Today · 08:04", merchant: "Whole Foods" },
  { id: "t3", title: "Uber", category: "transport", amount: -18.9, date: "Yesterday · 21:48" },
  { id: "t4", title: "Spotify", category: "entertainment", amount: -11.99, date: "Yesterday · 12:00" },
  { id: "t5", title: "Salary — Acme Inc.", category: "salary", amount: 6200.0, date: "Jul 15 · 09:00" },
  { id: "t6", title: "Aesop", category: "shopping", amount: -142.0, date: "Jul 14 · 17:22" },
  { id: "t7", title: "Con Edison", category: "bills", amount: -96.14, date: "Jul 12 · 07:00" },
  { id: "t8", title: "Delta Airlines", category: "travel", amount: -412.5, date: "Jul 09 · 15:30" },
];

export const balance = 12480.55;
export const monthlyIncome = 6200;
export const monthlyExpenses = 2874.35;
export const financialScore = 812;

export const cards = [
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
];

export const goals = [
  { id: "g1", name: "Emergency Fund", saved: 4200, target: 10000, emoji: "🛟", eta: "Dec 2026" },
  { id: "g2", name: "Tokyo Trip", saved: 1830, target: 3500, emoji: "🗼", eta: "Mar 2027" },
  { id: "g3", name: "New MacBook", saved: 940, target: 2500, emoji: "💻", eta: "Sep 2026" },
  { id: "g4", name: "Down Payment", saved: 12400, target: 60000, emoji: "🏡", eta: "2029" },
];

export const spendingByDay = [
  { day: "Mon", value: 42 },
  { day: "Tue", value: 78 },
  { day: "Wed", value: 26 },
  { day: "Thu", value: 130 },
  { day: "Fri", value: 95 },
  { day: "Sat", value: 168 },
  { day: "Sun", value: 54 },
];

export const spendingByCategory = [
  { name: "Food", value: 620, color: "oklch(0.7 0.19 30)" },
  { name: "Shopping", value: 480, color: "oklch(0.65 0.2 300)" },
  { name: "Transport", value: 210, color: "oklch(0.72 0.15 240)" },
  { name: "Bills", value: 340, color: "oklch(0.82 0.17 80)" },
  { name: "Fun", value: 190, color: "oklch(0.7 0.2 340)" },
  { name: "Travel", value: 412, color: "oklch(0.78 0.16 180)" },
];

export const cashflow = [
  { m: "Feb", income: 5800, expense: 3100 },
  { m: "Mar", income: 6000, expense: 3400 },
  { m: "Apr", income: 6200, expense: 2900 },
  { m: "May", income: 6200, expense: 3600 },
  { m: "Jun", income: 6400, expense: 3200 },
  { m: "Jul", income: 6200, expense: 2874 },
];

export function formatMoney(n: number) {
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}$${str}`;
}

export function categoryOf(id: string): Category {
  return categories.find((c) => c.id === id) ?? categories[0];
}