import { createFileRoute } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { goals } from "@/lib/nova-data";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals · NOVA" },
      { name: "description", content: "Save toward what matters, one goal at a time." },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const overall = totalSaved / totalTarget;

  return (
    <AppShell>
      <PageHeader
        subtitle="Savings"
        title="Goals"
        right={
          <button
            className="grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
            aria-label="Add goal"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
        }
      />

      <section className="px-5">
        <div
          className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Total saved
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                ${totalSaved.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                of ${totalTarget.toLocaleString()} goal
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" /> On track
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${overall * 100}%`, background: "var(--gradient-primary)" }}
            />
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-3 px-5">
        {goals.map((g) => {
          const pct = Math.min(1, g.saved / g.target);
          return (
            <article
              key={g.id}
              className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background text-2xl">
                  {g.emoji}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Target · {g.eta}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">${g.saved.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">
                    of ${g.target.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct * 100}%`, background: "var(--gradient-primary)" }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{Math.round(pct * 100)}% complete</span>
                <span>${(g.target - g.saved).toLocaleString()} to go</span>
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}