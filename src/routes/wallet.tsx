import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, CreditCard, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { categoryOf } from "@/lib/nova-data";
import { useNova, groupByBucket, formatTxDate } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet · NOVA" },
      { name: "description", content: "Your NOVA cards and transactions in one place." },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { state, deleteTransaction } = useNova();
  const { format } = useCurrency();
  const groups = groupByBucket(state.transactions);
  return (
    <AppShell>
      <PageHeader
        subtitle="Your money"
        title="Wallet"
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
            <button
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <section className="px-5">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {state.accounts.map((c) => (
            <article
              key={c.id}
              className="relative aspect-[1.6/1] min-w-[280px] snap-center overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[var(--shadow-elevated)]"
              style={{ background: c.gradient }}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/70">NOVA</p>
                  <p className="text-sm font-semibold">{c.name}</p>
                </div>
                <CreditCard className="h-5 w-5 opacity-80" />
              </div>
              <div className="absolute bottom-5 left-5 right-5">
                <p className="text-lg font-semibold tracking-widest">{c.number}</p>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/60">Holder</p>
                    <p className="text-xs font-medium">{c.holder}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-white/60">Balance</p>
                    <p className="text-sm font-semibold">{format(c.balance)}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
          <button
            className="grid aspect-[1.6/1] min-w-[280px] snap-center place-items-center rounded-3xl border border-dashed border-border bg-card/40 text-muted-foreground"
            aria-label="Add card"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card">
                <Plus className="h-4 w-4" />
              </span>
              <span className="text-xs">Add card</span>
            </div>
          </button>
        </div>
      </section>

      <section className="mt-8 space-y-5 px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Transactions</h2>
          <span className="text-xs text-muted-foreground">
            {state.transactions.length} total
          </span>
        </div>
        {groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No transactions yet. Tap + to add one.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.bucket} className="animate-fade-in">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.bucket}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {group.items.length} item{group.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
                {group.items.map((t) => {
                  const cat = categoryOf(t.category);
                  const Icon = cat.icon;
                  const positive = t.amount > 0;
                  return (
                    <li
                      key={t.id}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card"
                    >
                      <div
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)`,
                        }}
                      >
                        <Icon className="h-4 w-4" style={{ color: cat.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {cat.name} · {formatTxDate(t.date)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          positive ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {format(t.amount)}
                      </span>
                      <button
                        onClick={() => deleteTransaction(t.id)}
                        aria-label="Delete transaction"
                        className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}