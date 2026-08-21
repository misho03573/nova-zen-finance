import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Trash2, Wand2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { EmptyState } from "@/components/nova/EmptyState";
import { PreviewBadge } from "@/components/nova/PreviewBadge";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { useNova } from "@/lib/nova-store";
import { useT, fmt } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation · NOVA" },
      {
        name: "description",
        content: "Rules that quietly grow your savings while you live your life.",
      },
    ],
  }),
  component: AutomationPage,
});

function AutomationPage() {
  const { state, toggleAutomation, deleteAutomation } = useNova();
  const confirm = useConfirm();
  const t = useT();
  const active = state.automationRules.filter((r) => r.enabled).length;

  return (
    <AppShell>
      <PageHeader
        subtitle={t("auto.subtitle")}
        title={t("auto.title")}
        right={
          <Link
            to="/"
            aria-label={t("action.back")}
            className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <section className="px-5">
        <div
          className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("auto.rulesActive")}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {active}
                <span className="text-muted-foreground">/{state.automationRules.length}</span>
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <PreviewBadge /> {t("auto.simulated")}
              </p>
            </div>
            <span
              className="grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-5 w-5" />
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-2 px-5">
        {state.automationRules.length === 0 ? (
          <EmptyState
            icon={<Wand2 className="h-6 w-6" />}
            title={t("auto.empty.title")}
            description={t("auto.empty.desc")}
          />
        ) : (
          state.automationRules.map((r) => (
            <div
              key={r.id}
              className="animate-rise-in flex items-center gap-3 rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Wand2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.label}</p>
                <p className="truncate text-xs text-muted-foreground capitalize">
                  {r.kind.replace(/_/g, " ")}
                  {r.amount ? ` · ${r.amount}${r.kind === "salary_percent" ? "%" : ""}` : ""}
                </p>
              </div>
              <Switch
                checked={r.enabled}
                onCheckedChange={() => {
                  toggleAutomation(r.id);
                  toast.message(r.enabled ? t("auto.paused") : t("auto.enabled"));
                }}
                aria-label={fmt(t("auto.toggleAria"), { label: r.label })}
              />
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: fmt(t("auto.deleteTitle"), { label: r.label }),
                    description: t("auto.deleteDesc"),
                    confirmLabel: t("action.delete"),
                    destructive: true,
                  });
                  if (ok) {
                    deleteAutomation(r.id);
                    toast.message(t("auto.deleted"));
                  }
                }}
                aria-label={t("auto.deleteAria")}
                className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}