import { createFileRoute, Link } from "@tanstack/react-router";
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
  X,
  Pencil,
  ArrowLeftRight,
  Wand2,
  Scale,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { useCategoryLookup, useCategories } from "@/lib/categories";
import { useCategoryName, useT, fmt, useDateLabels } from "@/lib/i18n";
import {
  useNova,
  groupByBucket,
  formatTxDate,
  accountTypeLabel,
  type AccountType,
  type Account,
  accountCurrency,
  txCurrency,
  isAdjustment,
} from "@/lib/nova-store";
import type { Transaction } from "@/lib/nova-store";
import { useAuth } from "@/lib/auth";
import { TxFilterPanel, Highlight } from "@/components/nova/TxFilterPanel";
import { useTxFilters, matchesFilters, filtersActive, highlightParts } from "@/lib/tx-filters";
import { useCurrency, CURRENCIES, convertAmount, type CurrencyCode } from "@/lib/currency";
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
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useHideBalances, maskAmount } from "@/lib/hide-balance";
import { EmptyState } from "@/components/nova/EmptyState";

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
  cash: {
    icon: Banknote,
    gradient: "linear-gradient(135deg, oklch(0.4 0.08 145), oklch(0.28 0.06 155))",
  },
  bank: { icon: Landmark, gradient: "var(--gradient-wallet)" },
  revolut: {
    icon: CreditCard,
    gradient: "linear-gradient(135deg, oklch(0.35 0.12 200), oklch(0.25 0.1 260))",
  },
  trading: {
    icon: LineChart,
    gradient: "linear-gradient(135deg, oklch(0.38 0.12 250), oklch(0.24 0.08 280))",
  },
  crypto: {
    icon: Bitcoin,
    gradient: "linear-gradient(135deg, oklch(0.55 0.16 60), oklch(0.32 0.12 30))",
  },
};

function WalletPage() {
  const { state, deleteTransaction } = useNova();
  const { formatIn } = useCurrency();
  const confirm = useConfirm();
  const hide = useHideBalances();
  const categoryOf = useCategoryLookup();
  const catName = useCategoryName();
  const tr = useT();
  const dateLabels = useDateLabels();
  const { user } = useAuth();
  const { filters, update, reset } = useTxFilters(user?.id);
  const [showSearch, setShowSearch] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const names = useMemo(
    () => ({
      categoryName: (id: string) => {
        const c = categoryOf(id);
        return catName(c.id, c.name, c.builtin);
      },
      accountName: (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.accounts, state.categories],
  );

  const filtered = useMemo(
    () => state.transactions.filter((t) => matchesFilters(t, filters, state.accounts, names)),
    [state.transactions, state.accounts, filters, names],
  );
  const groups = groupByBucket(filtered);

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("wallet.subtitle")}
        title={tr("wallet.title")}
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
            <TransferDialog />
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
              aria-label={tr("wallet.search")}
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
          <AccountDialog
            trigger={
              <button
                className="grid aspect-[1.6/1] min-w-[280px] snap-center place-items-center rounded-3xl border border-dashed border-border bg-card/40 text-muted-foreground transition-colors hover:bg-card/60"
                aria-label={tr("wallet.addAccount")}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="text-xs">{tr("wallet.addAccount")}</span>
                </div>
              </button>
            }
          />
        </div>
      </section>

      {showSearch || filtersActive(filters) ? (
        <TxFilterPanel
          filters={filters}
          update={update}
          reset={reset}
          open={showAdvanced}
          onToggleOpen={() => setShowAdvanced((v) => !v)}
        />
      ) : null}

      <section className="mt-8 space-y-5 px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{tr("wallet.transactions")}</h2>
          <span className="text-xs text-muted-foreground">
            {filtered.length} {tr("wallet.of")} {state.transactions.length}
          </span>
        </div>
        {groups.length === 0 ? (
          state.transactions.length === 0 ? (
            <EmptyState
              icon={<Plus className="h-6 w-6" />}
              title={tr("wallet.noTx")}
              description={tr("wallet.noTx.desc")}
              ctaLabel={tr("nav.add")}
              ctaTo="/add"
            />
          ) : (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title={tr("wallet.noResults")}
              description={tr("wallet.noResults.desc")}
            />
          )
        ) : (
          groups.map((group) => (
            <div key={group.bucket} className="animate-fade-in">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.bucket === "Today"
                    ? tr("date.today")
                    : group.bucket === "Yesterday"
                      ? tr("date.yesterday")
                      : tr("date.earlier")}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? tr("wallet.item") : tr("wallet.items")}
                </span>
              </div>
              <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
                {group.items.map((t) => {
                  const cat = categoryOf(t.category);
                  const Icon = cat.icon;
                  const positive = t.amount > 0;
                  const adj = isAdjustment(t);
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
                        <p className="truncate text-sm font-medium">
                          {adj ? (
                            tr("adjust.record")
                          ) : (
                            <Highlight parts={highlightParts(t.title, filters.query)} />
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {adj ? (
                            tr("adjust.category")
                          ) : (
                            <Highlight
                              parts={highlightParts(
                                catName(cat.id, cat.name, cat.builtin),
                                filters.query,
                              )}
                            />
                          )}
                          {" · "}
                          {formatTxDate(t.date, dateLabels)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          positive ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {maskAmount(hide, formatIn(t.amount, txCurrency(t, state.accounts)), "md")}
                      </span>
                      {adj ? (
                        <span
                          title={tr("adjust.immutable")}
                          className="ml-1 text-[10px] uppercase tracking-widest text-muted-foreground"
                        >
                          {tr("adjust.title")}
                        </span>
                      ) : (
                      <>
                      <Link
                        to="/rules"
                        search={{ merchant: t.title, category: t.category }}
                        aria-label={tr("rules.fromTx")}
                        title={tr("rules.fromTx")}
                        className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                      </Link>
                      <EditTxDialog tx={t} />
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: tr("wallet.deleteTx"),
                            description: fmt(tr("wallet.deleteTxDesc"), {
                              title: t.title,
                              amt: formatIn(t.amount, txCurrency(t, state.accounts)),
                            }),
                            confirmLabel: tr("common.delete") || "Delete",
                            destructive: true,
                          });
                          if (ok) {
                            deleteTransaction(t.id);
                            toast.message(tr("wallet.txDeleted"));
                          }
                        }}
                        aria-label={tr("wallet.txDeleted")}
                        className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      </>
                      )}
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
  return <AccountCardInner account={account} />;
}

function EditTxDialog({ tx }: { tx: Transaction }) {
  const { state, updateTransaction } = useNova();
  const categories = useCategories();
  const catName = useCategoryName();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(tx.title);
  const [amount, setAmount] = useState(String(Math.abs(tx.amount)));
  const [isIncome, setIsIncome] = useState(tx.amount > 0);
  const [category, setCategory] = useState(tx.category);
  const [accountId, setAccountId] = useState(tx.accountId);
  const [date, setDate] = useState(tx.date.slice(0, 10));
  const [note, setNote] = useState(tx.note ?? "");

  function reset() {
    setTitle(tx.title);
    setAmount(String(Math.abs(tx.amount)));
    setIsIncome(tx.amount > 0);
    setCategory(tx.category);
    setAccountId(tx.accountId);
    setDate(tx.date.slice(0, 10));
    setNote(tx.note ?? "");
  }

  function save() {
    const abs = Math.abs(Number(amount));
    if (!title.trim() || !Number.isFinite(abs) || abs === 0) {
      toast.error(tr("wallet.editTx.invalid"));
      return;
    }
    updateTransaction({
      ...tx,
      title: title.trim(),
      amount: isIncome ? abs : -abs,
      category,
      accountId,
      date: new Date(`${date}T12:00:00`).toISOString(),
      note: note.trim() || undefined,
      // A hand-picked category must never be overwritten by smart rules.
      categoryLocked: category !== tx.category ? true : tx.categoryLocked,
    });
    setOpen(false);
    toast.success(tr("wallet.txUpdated"));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) reset();
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <button
          aria-label={tr("wallet.editTx")}
          title={tr("wallet.editTx")}
          className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("wallet.editTx")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([false, true] as const).map((inc) => (
              <button
                key={String(inc)}
                onClick={() => setIsIncome(inc)}
                className={cn(
                  "rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors",
                  isIncome === inc
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-card/60 text-muted-foreground",
                )}
              >
                {inc ? tr("add.type.income") : tr("add.type.expense")}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tx-title-${tx.id}`}>{tr("wallet.tx.name")}</Label>
            <Input
              id={`tx-title-${tx.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`tx-amount-${tx.id}`}>{tr("add.amount")}</Label>
              <Input
                id={`tx-amount-${tx.id}`}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tx-date-${tx.id}`}>{tr("wallet.tx.date")}</Label>
              <Input
                id={`tx-date-${tx.id}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tr("wallet.tx.account")}</Label>
            <div className="flex flex-wrap gap-2">
              {state.accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    accountId === a.id
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border bg-card/60 text-muted-foreground",
                  )}
                >
                  {a.name} · {accountCurrency(a)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tr("wallet.tx.category")}</Label>
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    category === c.id
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border bg-card/60 text-muted-foreground",
                  )}
                >
                  {catName(c.id, c.name, c.builtin)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tx-note-${tx.id}`}>{tr("wallet.tx.note")}</Label>
            <Input
              id={`tx-note-${tx.id}`}
              value={note}
              placeholder={tr("add.note.placeholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {accountId !== tx.accountId ? (
            <p className="text-xs text-muted-foreground">{tr("wallet.editTx.fxNote")}</p>
          ) : null}
        </div>
        <DialogFooter>
          <button
            onClick={save}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {tr("wallet.saveChanges")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountCardInner({ account }: { account: Account }) {
  const { formatIn } = useCurrency();
  const { state, deleteAccount, accountUsageOf } = useNova();
  const confirm = useConfirm();
  const hide = useHideBalances();
  const tr = useT();
  const Icon = TYPE_META[account.type].icon;
  const usage = accountUsageOf(account.id);
  const linked = usage.transactions + usage.recurring + usage.subscriptions;
  const others = state.accounts.filter((a) => a.id !== account.id);
  // A non-zero balance is financial value: deleting it outright would change
  // Net Worth, so it must be moved to another account too.
  const hasBalance = Math.abs(account.balance) > 0.005;
  const needsMove = linked > 0 || hasBalance;
  const [reassignOpen, setReassignOpen] = useState(false);
  const [target, setTarget] = useState<string>(others[0]?.id ?? "");
  return (
    <article
      className="group relative aspect-[1.6/1] min-w-[280px] snap-center overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[var(--shadow-elevated)]"
      style={{ background: account.gradient }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/70">
            {accountTypeLabel(account.type, tr)}
          </p>
          <p className="text-sm font-semibold">{account.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <AdjustBalanceDialog account={account} />
          <AccountDialog
            account={account}
            trigger={
              <button
                aria-label={tr("wallet.editAccount")}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            }
          />
          <button
            aria-label={tr("wallet.deleteAccount")}
            onClick={async () => {
              if (needsMove) {
                if (others.length === 0) {
                  toast.error(tr("wallet.delete.noTarget"));
                  return;
                }
                setTarget(others[0].id);
                setReassignOpen(true);
                return;
              }
              const ok = await confirm({
                title: fmt(tr("wallet.deleteAccount") + " {name}?", { name: account.name }),
                description: tr("wallet.deleteAccount.desc"),
                confirmLabel: tr("wallet.deleteAccount"),
                destructive: true,
              });
              if (ok) {
                deleteAccount(account.id);
                toast.message(tr("wallet.deleted"));
              }
            }}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/10 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <Icon className="h-5 w-5 opacity-80" />
        </div>
      </div>
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("wallet.delete.blocked.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {fmt(tr("wallet.delete.blocked.desc"), { count: linked })}
          </p>
          {hasBalance ? (
            <p className="text-sm text-muted-foreground">
              {fmt(tr("wallet.delete.movesBalance"), {
                amount: formatIn(account.balance, accountCurrency(account)),
              })}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label>{tr("wallet.delete.reassign")}</Label>
            <div className="flex flex-wrap gap-2">
              {others.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setTarget(a.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    target === a.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {a.name} · {accountCurrency(a)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{tr("wallet.delete.reassignDesc")}</p>
          </div>
          <DialogFooter>
            <button
              onClick={() => {
                if (!target) return;
                deleteAccount(account.id, target);
                setReassignOpen(false);
                toast.success(tr("wallet.deleted"));
              }}
              className="w-full rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
            >
              {tr("wallet.delete.confirmMove")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="absolute bottom-5 left-5 right-5">
        <p className="text-lg font-semibold tracking-widest">{account.number}</p>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/60">
              {tr("wallet.holder") /* i18n-ignore */}
            </p>
            <p className="text-xs font-medium">{account.holder}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-white/60">
              {tr("wallet.balanceField")}
            </p>
            <p className="text-sm font-semibold">
              {maskAmount(hide, formatIn(account.balance, accountCurrency(account)), "md")}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Balance reconciliation. The user types the real-world balance; NOVA derives
 * the difference and writes an immutable `adjustment` record in the account's
 * NATIVE currency (never converted before storage).
 */
function AdjustBalanceDialog({ account }: { account: Account }) {
  const { adjustBalance } = useNova();
  const { formatIn } = useCurrency();
  const tr = useT();
  const cur = accountCurrency(account);
  const [open, setOpen] = useState(false);
  const [actual, setActual] = useState(String(account.balance));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const parsed = Number.parseFloat(actual.replace(",", "."));
  const valid = Number.isFinite(parsed);
  const diff = valid ? parsed - account.balance : 0;
  const reconciled = valid && Math.abs(diff) < (cur === "JPY" ? 1 : 0.005);

  function save() {
    if (!valid) {
      toast.error(tr("adjust.invalid"));
      return;
    }
    if (reconciled) {
      toast.message(tr("adjust.reconciled"));
      setOpen(false);
      return;
    }
    adjustBalance(account.id, parsed, {
      date: new Date(`${date}T12:00:00`).toISOString(),
      note: note.trim() || undefined,
    });
    setOpen(false);
    toast.success(tr("adjust.done"));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setActual(String(account.balance));
          setDate(new Date().toISOString().slice(0, 10));
          setNote("");
        }
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <button
          aria-label={tr("adjust.cta")}
          title={tr("adjust.cta")}
          className="grid h-7 w-7 place-items-center rounded-full bg-white/10 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        >
          <Scale className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("adjust.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card/60 px-4 py-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {tr("adjust.current")}
            </p>
            <p className="text-lg font-semibold">{formatIn(account.balance, cur)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`adj-actual-${account.id}`}>
              {tr("adjust.actual")} · {cur}
            </Label>
            <Input
              id={`adj-actual-${account.id}`}
              inputMode="decimal"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </div>
          <div className="flex items-baseline justify-between rounded-2xl border border-border bg-card/40 px-4 py-2">
            <span className="text-xs text-muted-foreground">{tr("adjust.difference")}</span>
            <span
              className={cn(
                "text-sm font-semibold",
                diff > 0 ? "text-primary" : diff < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {valid ? formatIn(diff, cur) : "—"}
            </span>
          </div>
          {reconciled ? (
            <p className="text-xs text-muted-foreground">{tr("adjust.reconciled")}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`adj-date-${account.id}`}>{tr("adjust.date")}</Label>
              <Input
                id={`adj-date-${account.id}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`adj-note-${account.id}`}>{tr("adjust.note")}</Label>
              <Input
                id={`adj-note-${account.id}`}
                value={note}
                placeholder={tr("adjust.note.placeholder")}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{tr("adjust.excluded")}</p>
        </div>
        <DialogFooter>
          <button
            onClick={save}
            disabled={!valid || reconciled}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            {tr("adjust.confirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({ trigger, account }: { trigger: React.ReactNode; account?: Account }) {
  const { addAccount, updateAccount } = useNova();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [balance, setBalance] = useState(String(account?.balance ?? 0));
  const [number, setNumber] = useState(account?.number ?? "•••• 0000");
  const [currency, setCurrencyCode] = useState<CurrencyCode>(
    (account?.currency ?? "USD") as CurrencyCode,
  );

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
        currency,
        gradient: TYPE_META[type].gradient,
      });
      toast.success(tr("wallet.accountUpdated"));
    } else {
      addAccount({
        name: name.trim(),
        type,
        balance: bal,
        number,
        currency,
        holder: "A. MORGAN",
        brand: type === "crypto" ? "Wallet" : "Visa",
        gradient: TYPE_META[type].gradient,
      });
      toast.success(tr("wallet.accountAdded"));
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{account ? tr("wallet.editAccount") : tr("wallet.newAccount")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{tr("common.name") /* i18n-ignore */}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("wallet.namePlaceholder") /* i18n-ignore */}
            />
          </div>
          <div>
            <Label className="text-xs">{tr("common.type") /* i18n-ignore */}</Label>
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
              <Label className="text-xs">{tr("wallet.balanceField")}</Label>
              <Input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{tr("wallet.identifier")}</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">{tr("wallet.currencyField")}</Label>
            <select
              value={currency}
              onChange={(e) => setCurrencyCode(e.target.value as CurrencyCode)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code} — {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {fmt(tr("wallet.currencyNote"), { cur: currency })}
            </p>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={save}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {account ? tr("wallet.saveChanges") : tr("wallet.addAccount")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog() {
  const { state, transfer } = useNova();
  const { formatIn } = useCurrency();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(state.accounts[0]?.id ?? "");
  const [toId, setToId] = useState(state.accounts[1]?.id ?? "");
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");

  const from = state.accounts.find((a) => a.id === fromId);
  const to = state.accounts.find((a) => a.id === toId);
  const fromCur = (from?.currency ?? "USD") as CurrencyCode;
  const toCur = (to?.currency ?? "USD") as CurrencyCode;
  const amount = Number.parseFloat(amountStr) || 0;
  const converted = amount > 0 && from && to ? convertAmount(amount, fromCur, toCur) : 0;
  const canSave =
    !!from && !!to && from.id !== to.id && amount > 0 && amount <= from.balance + 1e-9;

  const submit = () => {
    if (!canSave || !from || !to) return;
    transfer({ fromId: from.id, toId: to.id, amount, note: note.trim() || undefined });
    toast.success(tr("wallet.transferComplete"), {
      description: `${formatIn(amount, fromCur)} → ${formatIn(converted, toCur)}`,
    });
    setOpen(false);
    setAmountStr("");
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label={tr("wallet.transfer")}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("wallet.transferTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{tr("wallet.from")}</Label>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatIn(a.balance, accountCurrency(a))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{tr("wallet.to")}</Label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {state.accounts
                .filter((a) => a.id !== fromId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({accountCurrency(a)})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{fmt(tr("wallet.amountIn"), { cur: fromCur })}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
            />
            {amount > 0 && from && to && fromCur !== toCur ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {fmt(tr("wallet.fxNote"), { out: formatIn(converted, toCur) })}
              </p>
            ) : null}
            {from && amount > from.balance ? (
              <p className="mt-1 text-[11px] text-destructive">
                {fmt(tr("wallet.exceeds"), {
                  name: from.name,
                  bal: formatIn(from.balance, fromCur),
                })}
              </p>
            ) : null}
          </div>
          <div>
            <Label className="text-xs">{tr("common.note") /* i18n-ignore */}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr("common.optional") /* i18n-ignore */}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={submit}
            disabled={!canSave}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
            style={{ background: "var(--gradient-primary)" }}
          >
            {tr("wallet.transfer")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
