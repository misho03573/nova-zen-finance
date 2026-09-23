import { buildAiSnapshot, snapshotLines } from "@/lib/ai-context";
import { buildFinancialContext } from "@/lib/financial-context";
import { convertAmount, type CurrencyCode } from "@/lib/currency";
import {
  accountCurrency,
  budgetCurrency,
  emptyState,
  goalCurrency,
  liabilityCurrency,
  type NovaState,
} from "@/lib/nova-store";
import { sanitizePersistedState } from "@/lib/persisted-state";

export function buildServerSnapshotLines(raw: unknown, to: CurrencyCode, now = Date.now()): string[] {
  const state = sanitizePersistedState<NovaState>(raw) ?? emptyState;
  const accountCurrencies = new Map(state.accounts.map((a) => [a.id, accountCurrency(a)]));
  const convert = (value: number, from: CurrencyCode) => convertAmount(value, from, to);
  const accounts = state.accounts.map((a) => ({ ...a, balance: convert(a.balance, accountCurrency(a)) }));
  const transactions = state.transactions.map((tx) => ({
    ...tx,
    amount: convert(tx.amount, tx.currency ?? accountCurrencies.get(tx.accountId) ?? "USD"),
  }));
  const recurring = state.recurring.map((item) => ({
    ...item,
    amount: convert(item.amount, item.currency ?? accountCurrencies.get(item.accountId) ?? "USD"),
  }));
  const subscriptions = state.subscriptions.map((item) => ({
    ...item,
    amount: convert(item.amount, item.currency ?? accountCurrencies.get(item.accountId ?? "") ?? "USD"),
    currency: to,
  }));
  const context = buildFinancialContext({
    accounts,
    transactions,
    budgets: state.budgets.map((b) => ({ ...b, limit: convert(b.limit, budgetCurrency(b)), currency: to })),
    goals: state.goals.map((g) => ({
      ...g,
      saved: convert(g.saved, goalCurrency(g)),
      target: convert(g.target, goalCurrency(g)),
      monthly: g.monthly == null ? undefined : convert(g.monthly, goalCurrency(g)),
      currency: to,
    })),
    liabilities: state.liabilities.map((l) => ({ ...l, balance: convert(l.balance, liabilityCurrency(l)), currency: to })),
    recurring,
    subscriptions,
    merchants: state.merchants,
    essentialCategories: state.settings.essentialCategories ?? [],
    emergencyTargetMonths: state.settings.emergencyTargetMonths ?? 6,
    buffer: convert(state.settings.forecastBuffer ?? 0, "USD"),
    now,
  });
  return snapshotLines(buildAiSnapshot(context));
}