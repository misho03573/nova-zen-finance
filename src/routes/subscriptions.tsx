import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useCurrency } from "@/lib/currency";
import { useNova, subscriptionsMonthlyTotal, type Subscription } from "@/lib/nova-store";
import { useHideBalances, maskAmount } from "@/lib/hide-balance";
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

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions · NOVA" },
      {
        name: "description",
        content: "See every recurring subscription and what it costs each month.",
      },
    ],
  }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { state, deleteSubscription, addSubscription } = useNova();
  const { format } = useCurrency();
  const hide = useHideBalances();
  const confirm = useConfirm();
  const total = subscriptionsMonthlyTotal(state.subscriptions);
  const yearly = total * 12;

  return (
    <AppShell>
      <PageHeader
        subtitle="Recurring"
        title="Subscriptions"
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
            <Link
              to="/"
              aria-label="Back"
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-5">
        <div
          className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Monthly total</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">
            {maskAmount(hide, format(total), "lg")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state.subscriptions.length} active · {maskAmount(hide, format(yearly), "md")}/yr
          </p>
        </div>
      </section>

      <section className="mt-6 space-y-2 px-5">
        {state.subscriptions.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-6 w-6" />}
            title="No subscriptions yet"
            description="Add a recurring service to see the true monthly cost."
          />
        ) : (
          state.subscriptions.map((s) => (
            <article
              key={s.id}
              className="animate-rise-in flex items-center gap-3 rounded-3xl border border-border bg-card/70 p-3 shadow-[var(--shadow-card)]"
            >
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg text-white"
                style={{ background: s.color }}
                aria-hidden
              >
                {s.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Next {new Date(s.nextDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {s.category}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{maskAmount(hide, format(s.amount), "md")}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">/mo</p>
              </div>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete ${s.name}?`,
                    description: "This removes the subscription from tracking. Existing transactions stay.",
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (ok) {
                    deleteSubscription(s.id);
                    toast.message(`${s.name} removed`);
                  }
                }}
                aria-label={`Delete ${s.name}`}
                className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))
        )}
      </section>

      <section className="mt-6 px-5">
        <AddSubscriptionDialog
          onAdd={(s) => {
            addSubscription(s);
            toast.success(`${s.name} added`);
          }}
        />
      </section>
    </AppShell>
  );
}

function AddSubscriptionDialog({ onAdd }: { onAdd: (s: Omit<Subscription, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [emoji, setEmoji] = useState("✨");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="press flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus className="h-4 w-4" /> Add subscription
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>New subscription</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Notion" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Monthly amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="9.99"
              />
            </div>
            <div>
              <Label className="text-xs">Emoji</Label>
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 2))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => {
              const n = Number.parseFloat(amount);
              if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
              const next = new Date();
              next.setMonth(next.getMonth() + 1);
              onAdd({
                name: name.trim(),
                amount: n,
                category: "subscription",
                nextDate: next.toISOString(),
                color: "#3b82f6",
                emoji: emoji || "✨",
              });
              setOpen(false);
              setName("");
              setAmount("");
              setEmoji("✨");
            }}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}