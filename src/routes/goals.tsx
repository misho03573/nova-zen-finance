import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Sparkles, Trash2, Pencil, PiggyBank } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { useCurrency } from "@/lib/currency";
import { useNova, estimateGoalETA, type Goal } from "@/lib/nova-store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useHideBalances, maskAmount } from "@/lib/hide-balance";
import { EmptyState } from "@/components/nova/EmptyState";
import { useT, fmt, useLocale } from "@/lib/i18n";

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
  const { format } = useCurrency();
  const { state, deleteGoal, contributeGoal } = useNova();
  const confirm = useConfirm();
  const hide = useHideBalances();
  const tr = useT();
  const locale = useLocale();
  const goals = state.goals;
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0) || 1;
  const overall = totalSaved / totalTarget;

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("goals.subtitle")}
        title={tr("goals.title")}
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
            <GoalDialog
              trigger={
                <button
                  className="grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]"
                  style={{ background: "var(--gradient-primary)" }}
                  aria-label={tr("goals.add")}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              }
            />
          </div>
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
                {tr("goals.totalSaved")}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{maskAmount(hide, format(totalSaved), "lg")}</p>
              <p className="text-xs text-muted-foreground">{tr("goals.of")} {maskAmount(hide, format(totalTarget), "md")} {tr("goals.goalWord")}</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" /> {tr("goals.onTrack")}
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${overall * 100}%`, background: "var(--gradient-primary)" }}
            />
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-3 px-5">
        {goals.length === 0 ? (
          <EmptyState
            icon={<PiggyBank className="h-6 w-6" />}
            title={tr("goals.emptyTitle")}
            description="Set a target — a trip, an emergency fund, a new laptop — and watch progress grow."
          />
        ) : null}
        {goals.map((g) => {
          const pct = Math.min(1, g.saved / g.target);
          const eta = estimateGoalETA(g, { achieved: tr("goal.achieved"), locale });
          return (
            <article
              key={g.id}
              className="group animate-fade-in rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background text-2xl">
                  {g.emoji}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tr("goals.eta")} · {eta}
                    {g.monthly ? ` · ${format(g.monthly)}/mo` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{maskAmount(hide, format(g.saved), "md")}</p>
                  <p className="text-[11px] text-muted-foreground">{tr("goals.of")} {maskAmount(hide, format(g.target), "md")}</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${pct * 100}%`, background: "var(--gradient-primary)" }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{fmt(tr("goals.pctComplete"), { pct: Math.round(pct * 100) })}</span>
                <span>{fmt(tr("goals.toGo"), { amt: format(Math.max(0, g.target - g.saved)) })}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <ContributeDialog goalId={g.id} />
                <GoalDialog
                  goal={g}
                  trigger={
                    <button className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card/60 text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  }
                />
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete "${g.name}"?`,
                      description: "Your progress and monthly target will be lost.",
                      confirmLabel: "Delete goal",
                      destructive: true,
                    });
                    if (ok) {
                      deleteGoal(g.id);
                      toast.message("Goal deleted");
                    }
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card/60 text-muted-foreground hover:text-destructive"
                  aria-label={tr("goals.deleteAria")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}

function ContributeDialog({ goalId }: { goalId: string }) {
  const { contributeGoal } = useNova();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("50");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <PiggyBank className="h-3.5 w-3.5" /> {tr("goals.addFunds")}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{tr("goals.addFunds.title")}</DialogTitle>
        </DialogHeader>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="50"
          autoFocus
        />
        <DialogFooter>
          <button
            onClick={() => {
              const n = Number.parseFloat(amount);
              if (!Number.isFinite(n) || n === 0) return;
              contributeGoal(goalId, n);
              toast.success(n > 0 ? "Contribution added" : "Amount withdrawn");
              setOpen(false);
            }}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {tr("goals.confirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({ trigger, goal }: { trigger: React.ReactNode; goal?: Goal }) {
  const { addGoal, updateGoal } = useNova();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(String(goal?.target ?? 1000));
  const [saved, setSaved] = useState(String(goal?.saved ?? 0));
  const [monthly, setMonthly] = useState(String(goal?.monthly ?? 100));
  const [emoji, setEmoji] = useState(goal?.emoji ?? "🎯");

  const save = () => {
    if (!name.trim()) return;
    const t = Number.parseFloat(target) || 0;
    const s = Number.parseFloat(saved) || 0;
    const m = Number.parseFloat(monthly) || 0;
    if (goal) {
      updateGoal({ ...goal, name: name.trim(), target: t, saved: s, monthly: m, emoji });
      toast.success("Goal updated");
    } else {
      addGoal({ name: name.trim(), target: t, saved: s, monthly: m, emoji, eta: "" });
      toast.success("Goal created");
    }
    setOpen(false);
  };

  const emojis = ["🎯", "🛟", "🏡", "🚗", "✈️", "💻", "🎓", "💍", "🗼", "🎁"];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{goal ? tr("goals.editTitle") : tr("goals.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{tr("goals.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("goals.name.placeholder")} />
          </div>
          <div>
            <Label className="text-xs">{tr("goals.emoji")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {emojis.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`grid h-9 w-9 place-items-center rounded-xl border text-lg ${
                    emoji === e ? "border-primary/60 bg-primary/15" : "border-border bg-card/60"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">{tr("goals.target")}</Label>
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{tr("goals.savedField")}</Label>
              <Input type="number" value={saved} onChange={(e) => setSaved(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{tr("goals.monthly")}</Label>
              <Input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={save}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {goal ? tr("goals.save") : tr("goals.create")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}