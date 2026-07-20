import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Trash2,
  Banknote,
  Landmark,
  CreditCard,
  LineChart,
  Bitcoin,
  Filter,
  X,
  Pencil,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { categoryOf, categories } from "@/lib/nova-data";
import {
  useNova,
  groupByBucket,
  formatTxDate,
  accountTypeLabel,
  type AccountType,
  type Account,
} from "@/lib/nova-store";
import { parseSearchQuery } from "@/lib/insights";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet · NOVA" },
      { name: "description", content: "Your NOVA cards and transactions in one place." },
    ],
  }),
  component: WalletPage,
});

const TYPE_META: Record<AccountType, { icon: typeof Banknote; gradient: string }> = {
  cash: { icon: Banknote, gradient: "linear-gradient(135deg, oklch(0.4 0.08 145), oklch(0.28 0.06 155))" },
  bank: { icon: Landmark, gradient: "var(--gradient-wallet)" },
  revolut: { icon: CreditCard, gradient: "linear-gradient(135deg, oklch(0.35 0.12 200), oklch(0.25 0.1 260))" },
  trading: { icon: LineChart, gradient: "linear-gradient(135deg, oklch(0.38 0.12 250), oklch(0.24 0.08 280))" },
  crypto: { icon: Bitcoin, gradient: "linear-gradient(135deg, oklch(0.55 0.16 60), oklch(0.32 0.12 30))" },
};

function WalletPage() {
  const { state, deleteTransaction } = useNova();
  const { format } = useCurrency();
  const [query, setQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const filtered = useMemo(() => {
    const match = parseSearchQuery(query);
    return state.transactions.filter((t) => {
      if (filterCategory && t.category !== filterCategory) return false;
      return match(t);
    });
  }, [state.transactions, query, filterCategory]);
  const groups = groupByBucket(filtered);

  return (
    <AppShell>
      <PageHeader
        subtitle="Your money"
        title="Wallet"
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
              aria-label="Search"
            >
              {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
          </div>
        }
      />

      <section className="px-5">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {state.accounts.map((c) => (
            <AccountCard key={c.id} account={c} />
          ))}
          <AccountDialog trigger={
            <button
              className="grid aspect-[1.6/1] min-w-[280px] snap-center place-items-center rounded-3xl border border-dashed border-border bg-card/40 text-muted-foreground transition-colors hover:bg-card/60"
              aria-label="Add account"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-xs">Add account</span>
              </div>
            </button>
          } />
        </div>
      </section>

      {showSearch ? (
        <section className="mt-3 px-5">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2 backdrop-blur">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try coffee, over 100, last month"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mt-4 px-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Filter className="h-3 w-3" /> Filter
          </span>
          <Chip active={filterCategory === null} onClick={() => setFilterCategory(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.id}
              active={filterCategory === c.id}
              onClick={() => setFilterCategory(filterCategory === c.id ? null : c.id)}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-5 px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Transactions</h2>
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {state.transactions.length}
          </span>
        </div>
        {groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No matching transactions.
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
                        onClick={() => {
                          deleteTransaction(t.id);
                          toast.message("Transaction deleted");
                        }}
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

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border bg-card/60 text-muted-foreground hover:bg-card",
      )}
    >
      {children}
    </button>
  );
}

function AccountCard({ account }: { account: Account }) {
  const { format } = useCurrency();
  const { deleteAccount } = useNova();
  const Icon = TYPE_META[account.type].icon;
  return (
    <article
      className="group relative aspect-[1.6/1] min-w-[280px] snap-center overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[var(--shadow-elevated)]"
      style={{ background: account.gradient }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/70">
            {accountTypeLabel(account.type)}
          </p>
          <p className="text-sm font-semibold">{account.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <AccountDialog
            account={account}
            trigger={
              <button
                aria-label="Edit"
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            }
          />
          <button
            aria-label="Delete account"
            onClick={() => {
              if (confirm(`Delete ${account.name}?`)) {
                deleteAccount(account.id);
                toast.message(`${account.name} deleted`);
              }
            }}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/10 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <Icon className="h-5 w-5 opacity-80" />
        </div>
      </div>
      <div className="absolute bottom-5 left-5 right-5">
        <p className="text-lg font-semibold tracking-widest">{account.number}</p>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/60">Holder</p>
            <p className="text-xs font-medium">{account.holder}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-white/60">Balance</p>
            <p className="text-sm font-semibold">{format(account.balance)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function AccountDialog({
  trigger,
  account,
}: {
  trigger: React.ReactNode;
  account?: Account;
}) {
  const { addAccount, updateAccount } = useNova();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [balance, setBalance] = useState(String(account?.balance ?? 0));
  const [number, setNumber] = useState(account?.number ?? "•••• 0000");

  const save = () => {
    const bal = Number.parseFloat(balance) || 0;
    if (!name.trim()) return;
    if (account) {
      updateAccount({
        ...account,
        name: name.trim(),
        type,
        balance: bal,
        number,
        gradient: TYPE_META[type].gradient,
      });
      toast.success("Account updated");
    } else {
      addAccount({
        name: name.trim(),
        type,
        balance: bal,
        number,
        holder: "A. MORGAN",
        brand: type === "crypto" ? "Wallet" : "Visa",
        gradient: TYPE_META[type].gradient,
      });
      toast.success("Account added");
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chase Checking" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {(Object.keys(TYPE_META) as AccountType[]).map((t) => {
                const I = TYPE_META[t].icon;
                const active = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] capitalize transition-colors",
                      active
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border bg-card/60 text-muted-foreground",
                    )}
                  >
                    <I className="h-4 w-4" />
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Balance</Label>
              <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Identifier</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={save}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {account ? "Save changes" : "Add account"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}