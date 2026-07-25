import { useMemo } from "react";
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
  Landmark,
  Repeat,
  Shield,
  Droplet,
  ArrowLeftRight,
  Heart,
  BookOpen,
  Dumbbell,
  Baby,
  Dog,
  Wrench,
  Fuel,
  Wine,
  Pizza,
  Camera,
  Smartphone,
  Wallet,
  TrendingUp,
  DollarSign,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useNova } from "@/lib/nova-store";

export type CategoryType = "expense" | "income" | "transfer";

export type UserCategory = {
  id: string;
  name: string;
  icon: string; // key into iconRegistry
  color: string;
  type: CategoryType;
  /** Built-in categories cannot be deleted, but can be renamed / recolored. */
  builtin?: boolean;
};

export const iconRegistry: Record<string, LucideIcon> = {
  Utensils, Coffee, ShoppingBag, Car, Home, Plane, Music, Zap, Briefcase,
  Gift, Landmark, Repeat, Shield, Droplet, ArrowLeftRight, Heart, BookOpen,
  Dumbbell, Baby, Dog, Wrench, Fuel, Wine, Pizza, Camera, Smartphone, Wallet,
  TrendingUp, DollarSign, Sparkles, Tag,
};

export const iconNames = Object.keys(iconRegistry);

export const colorPalette: string[] = [
  "oklch(0.7 0.19 30)",   // red-orange
  "oklch(0.72 0.14 60)",  // amber
  "oklch(0.82 0.17 80)",  // yellow
  "oklch(0.78 0.16 155)", // green
  "oklch(0.72 0.14 140)", // emerald
  "oklch(0.72 0.15 210)", // teal
  "oklch(0.72 0.15 240)", // blue
  "oklch(0.65 0.2 300)",  // violet
  "oklch(0.7 0.16 280)",  // purple
  "oklch(0.7 0.2 340)",   // pink
  "oklch(0.66 0.16 20)",  // rust
  "oklch(0.72 0.05 260)", // slate
];

export const defaultCategories: UserCategory[] = [
  { id: "food",          name: "Food",          icon: "Utensils",       color: "oklch(0.7 0.19 30)",   type: "expense", builtin: true },
  { id: "coffee",        name: "Coffee",        icon: "Coffee",         color: "oklch(0.72 0.14 60)",  type: "expense", builtin: true },
  { id: "shopping",      name: "Shopping",      icon: "ShoppingBag",    color: "oklch(0.65 0.2 300)",  type: "expense", builtin: true },
  { id: "transport",     name: "Transport",     icon: "Car",            color: "oklch(0.72 0.15 240)", type: "expense", builtin: true },
  { id: "rent",          name: "Rent",          icon: "Home",           color: "oklch(0.75 0.12 200)", type: "expense", builtin: true },
  { id: "travel",        name: "Travel",        icon: "Plane",          color: "oklch(0.78 0.16 180)", type: "expense", builtin: true },
  { id: "entertainment", name: "Fun",           icon: "Music",          color: "oklch(0.7 0.2 340)",   type: "expense", builtin: true },
  { id: "bills",         name: "Bills",         icon: "Zap",            color: "oklch(0.82 0.17 80)",  type: "expense", builtin: true },
  { id: "utilities",     name: "Utilities",     icon: "Droplet",        color: "oklch(0.72 0.15 210)", type: "expense", builtin: true },
  { id: "insurance",     name: "Insurance",     icon: "Shield",         color: "oklch(0.72 0.14 140)", type: "expense", builtin: true },
  { id: "subscription",  name: "Subs",          icon: "Repeat",         color: "oklch(0.7 0.16 280)",  type: "expense", builtin: true },
  { id: "loan",          name: "Loan",          icon: "Landmark",       color: "oklch(0.66 0.16 20)",  type: "expense", builtin: true },
  { id: "salary",        name: "Salary",        icon: "Briefcase",      color: "oklch(0.82 0.18 155)", type: "income",  builtin: true },
  { id: "gift",          name: "Gift",          icon: "Gift",           color: "oklch(0.75 0.18 15)",  type: "income",  builtin: true },
  { id: "transfer",      name: "Transfer",      icon: "ArrowLeftRight", color: "oklch(0.72 0.05 260)", type: "transfer",builtin: true },
];

export const fallbackCategory: UserCategory = {
  id: "__other", name: "Other", icon: "Tag", color: "oklch(0.72 0.05 260)", type: "expense", builtin: true,
};

export function resolveCategory(cats: UserCategory[] | undefined, id: string): UserCategory {
  return cats?.find((c) => c.id === id) ?? defaultCategories.find((c) => c.id === id) ?? fallbackCategory;
}

export function IconFor({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Icon = iconRegistry[name] ?? Tag;
  return <Icon className={className} style={style} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCategories(type?: CategoryType) {
  const { state } = useNova();
  return useMemo(() => {
    const all = state.categories ?? defaultCategories;
    return type ? all.filter((c) => c.type === type) : all;
  }, [state.categories, type]);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCategoryOf() {
  const { state } = useNova();
  return (id: string) => resolveCategory(state.categories, id);
}

/**
 * Legacy-shape lookup: returns a category with `icon` resolved to a
 * Lucide component, matching the old `categoryOf()` API. Use this
 * everywhere transaction/budget/etc lists render an icon+color chip.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCategoryLookup() {
  const { state } = useNova();
  return (id: string) => {
    const c = resolveCategory(state.categories, id);
    const Icon = iconRegistry[c.icon] ?? iconRegistry.Tag;
    return { id: c.id, name: c.name, color: c.color, builtin: c.builtin, icon: Icon };
  };
}