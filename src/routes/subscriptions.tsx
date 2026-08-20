import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CURRENCIES, useCurrency, type CurrencyCode } from "@/lib/currency";
import {
  SUB_FREQUENCIES,
  subscriptionMonthlyAmount,
  subscriptionTotals,
  useNova,
  type BillingFrequency,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/nova-store";
import { useCategories } from "@/lib/categories";
import { detectRecurring, type DetectedRecurring } from "@/lib/recur-detect";
import { useHideBalances, maskAmount } from "@/lib/hide-balance";
import { useT, useCategoryName, fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions · NOVA" },
      {
        name: "description",
        content: "Track every recurring subscription, its billing cycle and true monthly cost.",
      },
      { property: "og:title", content: "Subscriptions · NOVA" },
      {
        property: "og:description",
        content: "Track every recurring subscription, its billing cycle and true monthly cost.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionsPage,
});

const UPCOMING_DAYS = 7;

function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function SubscriptionsPage() {
  const t = useT();
  const catName = useCategoryName();
  const confirm = useConfirm();
  const hide = useHideBalances();
  const { currency, formatFrom } = useCurrency();
  const {
    state,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    setSubscriptionStatus,
    setSettings,
  } = useNova();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [prefill, setPrefill] = useState<Omit<Subscription, "id"> | null>(null);

  const subs = state.subscriptions;
  const fallback = (state.accounts[0]?.currency ?? "USD") as CurrencyCode;

  const groups = useMemo(() => {
    const sorted = [...subs].sort(
      (a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime(),
    );
    const isActive = (s: Subscription) => (s.status ?? "active") === "active";
    return {
      upcoming: sorted.filter((s) => isActive(s) && daysUntil(s.nextDate) <= UPCOMING_DAYS),
      active: sorted.filter((s) => isActive(s) && daysUntil(s.nextDate) > UPCOMING_DAYS),
      paused: sorted.filter((s) => (s.status ?? "active") === "paused"),
      cancelled: sorted.filter((s) => s.status === "cancelled"),
    };
  }, [subs]);

  const activeSubs = useMemo(
    () => subs.filter((s) => (s.status ?? "active") === "active"),
    [subs],
  );
  const totals = subscriptionTotals(activeSubs, currency.code, fallback);

  const detected = useMemo(
    () =>
      detectRecurring({
        transactions: state.transactions,
        subscriptions: state.subscriptions,
        recurring: state.recurring,
        accounts: state.accounts,
        ignored: state.settings.ignoredRecurring ?? [],
        fallbackCurrency: fallback,
      }),
    [state.transactions, state.subscriptions, state.recurring, state.accounts, state.settings.ignoredRecurring, fallback],
  );

  const suggestionToSub = (d: DetectedRecurring): Omit<Subscription, "id"> => ({
    name: d.name,
    merchant: d.merchant,
    amount: d.amount,
    currency: d.currency,
    accountId: d.accountId,
    category: d.category,
    frequency: d.frequency,
    nextDate: d.nextDate,
    status: "active",
    color: "#3b82f6",
    emoji: "🔁",
  });

  const openSuggestion = (d: DetectedRecurring) => {
    setEditing(null);
    setPrefill(suggestionToSub(d));
    setOpen(true);
  };

  const ignoreSuggestion = (d: DetectedRecurring) => {
    setSettings({
      ignoredRecurring: [...(state.settings.ignoredRecurring ?? []), d.key],
    });
    toast.message(t("rd.ignored"));
  };

  const onDelete = async (s: Subscription) => {
    const ok = await confirm({
      title: fmt(t("subs.deleteTitle"), { name: s.name }),
      description: t("subs.deleteDesc"),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    deleteSubscription(s.id);
    toast.success(`${s.name} ${t("subs.removed")}`);
  };

  const renderCard = (s: Subscription) => {
    const status = (s.status ?? "active") as SubscriptionStatus;
    const freq = (s.frequency ?? "monthly") as BillingFrequency;
    const cur = (s.currency ?? fallback) as CurrencyCode;
    return (
      <article
        key={s.id}
        className="animate-rise-in rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center gap-3">
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
              {fmt(t("subs.nextOn"), {
                date: new Date(s.nextDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
                category: catName(s.category, s.category, true),
              })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold">
              {maskAmount(hide, formatFrom(s.amount, cur), "md")}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t(`subs.freq.${freq}`)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest",
              status === "active"
                ? "border-primary/50 bg-primary/10 text-primary"
                : status === "paused"
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {t(`subs.status.${status}`)}
          </span>
          {s.merchant ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
              {s.merchant}
            </span>
          ) : null}
          <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
            {maskAmount(hide, formatFrom(subscriptionMonthlyAmount(s), cur), "md")} {t("subs.per_mo")}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {status === "cancelled" ? null : (
              <button
                onClick={() => {
                  setSubscriptionStatus(s.id, status === "active" ? "paused" : "active");
                  toast.message(status === "active" ? t("subs.paused") : t("subs.resumed"));
                }}
                aria-label={status === "active" ? t("subs.pause") : t("subs.resume")}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                {status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              onClick={() => {
                setEditing(s);
                setOpen(true);
              }}
              aria-label={t("action.edit")}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(s)}
              aria-label={t("action.delete")}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        {s.notes ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{s.notes}</p>
        ) : null}
      </article>
    );
  };

  const section = (labelKey: string, list: Subscription[]) =>
    list.length === 0 ? null : (
      <section className="mt-6 space-y-2 px-5" key={labelKey}>
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t(labelKey)} · {list.length}
        </h2>
        {list.map(renderCard)}
      </section>
    );

  return (
    <AppShell>
      <PageHeader
        subtitle={t("subs.subtitle")}
        title={t("subs.title")}
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
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
        <div
          className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("subs.monthlyTotal")}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {maskAmount(hide, formatFrom(totals.monthly, currency.code), "lg")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmt(t("subs.summary"), {
                  n: activeSubs.length,
                  yr: maskAmount(hide, formatFrom(totals.yearly, currency.code), "md"),
                })}
              </p>
            </div>
            <span
              className="grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Repeat className="h-5 w-5" />
            </span>
          </div>
        </div>
      </section>

      {subs.length === 0 ? (
        <section className="mt-6 px-5">
          <EmptyState
            icon={<Repeat className="h-6 w-6" />}
            title={t("subs.empty.title")}
            description={t("subs.empty.desc")}
          />
        </section>
      ) : (
        <>
          {section("subs.group.upcoming", groups.upcoming)}
          {section("subs.group.active", groups.active)}
          {section("subs.group.paused", groups.paused)}
          {section("subs.group.cancelled", groups.cancelled)}
        </>
      )}

      <section className="mt-6 space-y-2 px-5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("rd.section")}
        </h2>
        {detected.length === 0 ? (
          <EmptyState
            icon={<Repeat className="h-6 w-6" />}
            title={t("rd.empty.title")}
            description={t("rd.empty.desc")}
          />
        ) : (
          <>
            <p className="px-1 text-xs text-muted-foreground">{t("rd.desc")}</p>
            {detected.map((d) => (
              <article
                key={d.key}
                className="animate-rise-in rounded-3xl border border-dashed border-border bg-card/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`subs.freq.${d.frequency}`)} ·{" "}
                      {fmt(t("rd.next"), {
                        date: new Date(d.nextDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        }),
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">
                    {maskAmount(hide, formatFrom(d.amount, d.currency), "md")}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest",
                      d.level === "high"
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {t(d.level === "high" ? "rd.conf.high" : "rd.conf.possible")}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                    {fmt(t("rd.matches"), { n: d.count })}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => openSuggestion(d)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      {t("rd.add")}
                    </button>
                    <button
                      onClick={() => openSuggestion(d)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      {t("rd.edit")}
                    </button>
                    <button
                      onClick={() => ignoreSuggestion(d)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {t("rd.ignore")}
                    </button>
                  </span>
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="mt-6 px-5">
        <button
          onClick={() => {
            setEditing(null);
            setPrefill(null);
            setOpen(true);
          }}
          className="press flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus className="h-4 w-4" /> {t("subs.add")}
        </button>
      </section>

      <SubscriptionDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setPrefill(null);
        }}
        editing={editing}
        prefill={prefill}
        defaultCurrency={fallback}
        onSave={(payload) => {
          if (editing) {
            updateSubscription({ ...editing, ...payload });
            toast.success(`${payload.name} ${t("subs.updated")}`);
          } else {
            addSubscription(payload);
            toast.success(`${payload.name} ${t("subs.added")}`);
          }
          setOpen(false);
        }}
      />
    </AppShell>
  );
}

function SubscriptionDialog({
  open,
  onOpenChange,
  editing,
  prefill,
  defaultCurrency,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Subscription | null;
  prefill?: Omit<Subscription, "id"> | null;
  defaultCurrency: CurrencyCode;
  onSave: (s: Omit<Subscription, "id">) => void;
}) {
  const t = useT();
  const catName = useCategoryName();
  const cats = useCategories();
  const { state } = useNova();

  const [name, setName] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState<CurrencyCode>(defaultCurrency);
  const [accountId, setAccountId] = useState<string>(state.accounts[0]?.id ?? "");
  const [category, setCategory] = useState<string>(cats[0]?.id ?? "subscription");
  const [frequency, setFrequency] = useState<BillingFrequency>("monthly");
  const [nextDate, setNextDate] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [notes, setNotes] = useState("");
  const [emoji, setEmoji] = useState("✨");

  useEffect(() => {
    if (!open) return;
    const s = editing ?? prefill ?? null;
    setName(s?.name ?? "");
    setMerchant(s?.merchant ?? "");
    setAmount(s ? String(s.amount) : "");
    setCur((s?.currency as CurrencyCode) ?? defaultCurrency);
    setAccountId(s?.accountId ?? state.accounts[0]?.id ?? "");
    setCategory(s?.category ?? cats[0]?.id ?? "subscription");
    setFrequency((s?.frequency as BillingFrequency) ?? "monthly");
    setNextDate((s?.nextDate ?? new Date().toISOString()).slice(0, 10));
    setStatus((s?.status as SubscriptionStatus) ?? "active");
    setNotes(s?.notes ?? "");
    setEmoji(s?.emoji ?? "✨");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefill]);

  // Keep the charge currency aligned with the linked account's native currency.
  useEffect(() => {
    const acc = state.accounts.find((a) => a.id === accountId);
    if (acc?.currency) setCur(acc.currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const submit = () => {
    const n = Number.parseFloat(amount);
    if (!name.trim() || !Number.isFinite(n) || n <= 0 || !nextDate) {
      toast.error(t("subs.invalid"));
      return;
    }
    onSave({
      name: name.trim(),
      merchant: merchant.trim() || undefined,
      amount: n,
      currency: cur,
      accountId: accountId || undefined,
      category,
      frequency,
      nextDate: new Date(`${nextDate}T12:00:00`).toISOString(),
      status,
      notes: notes.trim() || undefined,
      color: editing?.color ?? "#3b82f6",
      emoji: emoji || "✨",
    });
  };

  const chip = (activeState: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs font-medium",
      activeState ? "border-primary bg-primary/10 text-primary" : "border-border",
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-sm overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("subs.edit") : t("subs.new")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sub-name">{t("subs.name")}</Label>
              <Input
                id="sub-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("subs.namePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-emoji">{t("subs.emoji")}</Label>
              <Input
                id="sub-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-merchant">{t("subs.merchant")}</Label>
            <Input
              id="sub-merchant"
              value={merchant}
              maxLength={60}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder={t("subs.merchantPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sub-amount">{t("subs.amount")}</Label>
              <Input
                id="sub-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("subs.amountPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-currency">{t("subs.currency")}</Label>
              <select
                id="sub-currency"
                value={cur}
                onChange={(e) => setCur(e.target.value as CurrencyCode)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-account">{t("subs.account")}</Label>
            <select
              id="sub-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">{t("subs.noAccount")}</option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-category">{t("subs.category")}</Label>
            <select
              id="sub-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {catName(c.id, c.name, c.builtin)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("subs.frequency")}</Label>
            <div className="flex flex-wrap gap-2">
              {SUB_FREQUENCIES.map((f) => (
                <button key={f} type="button" onClick={() => setFrequency(f)} className={chip(frequency === f)}>
                  {t(`subs.freq.${f}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-date">{t("subs.nextDate")}</Label>
            <Input
              id="sub-date"
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("subs.status")}</Label>
            <div className="flex flex-wrap gap-2">
              {(["active", "paused", "cancelled"] as SubscriptionStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)}>
                  {t(`subs.status.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-notes">{t("subs.notes")}</Label>
            <Textarea
              id="sub-notes"
              value={notes}
              maxLength={200}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("subs.notesPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={submit}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {t("action.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
