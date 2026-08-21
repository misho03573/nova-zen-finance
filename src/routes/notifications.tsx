import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, BellOff, Check, Settings2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { SmartCard, SmartEmpty } from "@/components/nova/SmartCard";
import { useNova } from "@/lib/nova-store";
import { useNotifications } from "@/lib/use-financial-context";
import {
  NOTIFICATION_CATEGORIES,
  isEnabled,
  type NotificationCategory,
} from "@/lib/notifications";
import { useT, fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · NOVA" },
      {
        name: "description",
        content: "Bills, budgets, goals and cash-flow alerts in one smart notifications center.",
      },
      { property: "og:title", content: "Notifications · NOVA" },
      {
        property: "og:description",
        content: "Bills, budgets, goals and cash-flow alerts in one smart notifications center.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { state, setSettings } = useNova();
  const t = useT();
  const { items, read } = useNotifications();
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");

  const prefs = state.settings.notificationPrefs;
  const readSet = useMemo(() => new Set(read), [read]);
  const shown = items.filter((n) => filter === "all" || n.category === filter);
  const unread = items.filter((n) => !readSet.has(n.id)).length;

  const markAll = () => {
    setSettings({ notificationsRead: Array.from(new Set([...read, ...items.map((n) => n.id)])) });
  };

  const markOne = (id: string) => {
    if (readSet.has(id)) return;
    setSettings({ notificationsRead: [...read, id] });
  };

  const toggleCategory = (c: NotificationCategory) => {
    setSettings({
      notificationPrefs: { ...(prefs ?? {}), [c]: !isEnabled(prefs, c) },
    });
  };

  return (
    <AppShell>
      <PageHeader
        subtitle={
          unread > 0 ? fmt(t("ntf.unread"), { n: unread }) : t("ntf.allCaughtUp")
        }
        title={t("ntf.title")}
        right={
          <div className="flex items-center gap-2">
            {unread > 0 ? (
              <button
                onClick={markAll}
                className="press flex items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                <Check className="h-3.5 w-3.5" />
                {t("ntf.markAll")}
              </button>
            ) : null}
            <Link
              to="/"
              aria-label={t("action.back")}
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-5">
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(["all", ...NOTIFICATION_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                "press shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                filter === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-muted-foreground",
              )}
            >
              {t(`ntf.cat.${c}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 space-y-2 px-5">
        {shown.length === 0 ? (
          <SmartEmpty title={t("ntf.empty")} desc={t("ntf.emptyDesc")} />
        ) : (
          shown.map((n) => (
            <div key={n.id} className="relative">
              <SmartCard
                item={n}
                onClick={() => markOne(n.id)}
                trailing={
                  readSet.has(n.id) ? null : (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )
                }
              />
            </div>
          ))
        )}
      </section>

      <section className="mt-8 px-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          {t("ntf.prefs")}
        </p>
        <div className="space-y-2 rounded-2xl border border-border bg-card/70 p-3">
          {NOTIFICATION_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span>
                <span className="block font-medium">{t(`ntf.cat.${c}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`ntf.catDesc.${c}`)}</span>
              </span>
              <input
                type="checkbox"
                checked={isEnabled(prefs, c)}
                onChange={() => toggleCategory(c)}
                className="h-5 w-5 accent-[var(--primary)]"
              />
            </label>
          ))}
        </div>
        {state.settings.notifications === false ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <BellOff className="h-3.5 w-3.5" />
            {t("ntf.masterOff")}
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
