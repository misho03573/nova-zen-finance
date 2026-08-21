/**
 * React entry point for the Financial Context / Notifications / Intelligence
 * stack. Everything below it is pure, so this hook is the ONLY place that
 * converts currency (once, via `useDisplayState`) and reads settings.
 */
import { useMemo } from "react";
import { useDisplayState, useNova } from "@/lib/nova-store";
import { useCurrency, convertAmount, type CurrencyCode } from "@/lib/currency";
import { buildFinancialContext, type FinancialContext } from "@/lib/financial-context";
import { buildIntelligence, type SmartInsight } from "@/lib/intelligence";
import {
  buildNotifications,
  unreadCount,
  type NovaNotification,
} from "@/lib/notifications";

export function useFinancialContext(): FinancialContext {
  const display = useDisplayState();
  const { currency } = useCurrency();
  const to = currency.code as CurrencyCode;
  const bufferBase = display.settings.forecastBuffer ?? 0;

  return useMemo(
    () =>
      buildFinancialContext({
        accounts: display.accounts,
        transactions: display.transactions,
        budgets: display.budgets,
        goals: display.goals,
        liabilities: display.liabilities,
        recurring: display.recurring,
        subscriptions: display.subscriptions,
        merchants: display.merchants,
        essentialCategories: display.settings.essentialCategories ?? [],
        emergencyTargetMonths: display.settings.emergencyTargetMonths ?? 6,
        buffer: convertAmount(bufferBase, "USD", to),
      }),
    // `display` is rebuilt by useDisplayState only when state or currency change.
    [display, bufferBase, to],
  );
}

export function useIntelligence(): SmartInsight[] {
  const ctx = useFinancialContext();
  return useMemo(() => buildIntelligence(ctx), [ctx]);
}

export function useNotifications(): {
  ctx: FinancialContext;
  items: NovaNotification[];
  unread: number;
  read: string[];
} {
  const { state } = useNova();
  const ctx = useFinancialContext();
  const read = state.settings.notificationsRead ?? [];
  const items = useMemo(
    () =>
      buildNotifications({
        ctx,
        prefs: state.settings.notificationPrefs,
        enabled: state.settings.notifications !== false,
      }),
    [ctx, state.settings.notificationPrefs, state.settings.notifications],
  );
  return { ctx, items, unread: unreadCount(items, read), read };
}
