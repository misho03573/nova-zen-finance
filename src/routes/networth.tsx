import { createFileRoute } from "@tanstack/react-router";
import { Landmark, Coins, TrendingUp, Bitcoin, Home, Car, CreditCard, Building2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  filterByRange,
  monthChange,
  NW_RANGES,
  SNAPSHOT_BASE,
  type NwRange,
} from "@/lib/networth-history";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import {
  useNova,
  netWorthBreakdown,
  useDisplayState,
  liabilityCurrency,
  type Liability,
  type LiabilityType,
} from "@/lib/nova-store";
import { useCurrency, CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { toast } from "sonner";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useHideBalances, maskAmount } from "@/lib/hide-balance";
import { useT } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/networth")({
  head: () => ({
    meta: [
      { title: "Net Worth · NOVA" },
      { name: "description", content: "Track assets and liabilities in one beautiful view." },
    ],
  }),
  component: NetWorthPage,
});

function NetWorthPage() {
  const { state, addLiability, updateLiability, deleteLiability } = useNova();
  const display = useDisplayState();
  const { format, formatIn, currency, convert } = useCurrency();
  const confirm = useConfirm();
  const hide = useHideBalances();
  const t = useT();
  const [editing, setEditing] = useState<Liability | null>(null);
  // Everything in `display` is already converted exactly once into the active
  // display currency — accounts AND liabilities. Net = assets − liabilities.
  const b = useMemo(() => netWorthBreakdown(display), [display]);

  const [range, setRange] = useState<NwRange>("3M");
  // History is stored in USD base; convert exactly once for display.
  const history = useMemo(() => {
    const rows = filterByRange(state.netWorthHistory ?? [], range);
    return rows.map((s) => ({
      date: s.date,
      assets: convert(s.assets, SNAPSHOT_BASE),
      liabilities: convert(s.liabilities, SNAPSHOT_BASE),
      net: convert(s.net, SNAPSHOT_BASE),
    }));
  }, [state.netWorthHistory, range, convert]);

  const change = useMemo(() => {
    const m = monthChange(state.netWorthHistory ?? []);
    return { delta: convert(m.delta, SNAPSHOT_BASE), pct: m.pct, hasBaseline: m.hasBaseline };
  }, [state.netWorthHistory, convert]);

  const [active, setActive] = useState<number | null>(null);

  return (
    <AppShell>
      <PageHeader
        subtitle={t("nw.subtitle")}
        title={t("nw.title")}
        right={<CurrencyPicker variant="chip" />}
      />

      <section className="px-5">
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[var(--shadow-elevated)]"
          style={{ background: "var(--gradient-primary)" }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <p className="text-xs font-medium uppercase tracking-widest text-white/70">{t("nw.total")}</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">{maskAmount(hide, format(b.net), "lg")}</p>
          <p className="mt-1 text-[11px] uppercase tracking-widest text-white/60">
            {t("nw.assets")} {maskAmount(hide, format(b.assets), "md")} · {t("nw.debt")} {maskAmount(hide, format(-b.liab), "md")}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-white/90">
            <span>
              {change.delta >= 0 ? "+" : ""}
              {maskAmount(hide, format(change.delta), "md")} {t("nw.thisMonth")}
            </span>
            <span className="text-white/60">
              {change.pct >= 0 ? "+" : ""}
              {change.pct.toFixed(1)}%
            </span>
          </div>

          <div className="mt-4 flex gap-1.5">
            {NW_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => { setRange(r); setActive(null); }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  range === r ? "bg-white/25 text-white" : "bg-white/10 text-white/70"
                }`}
              >
                {t(`nw.range.${r}`)}
              </button>
            ))}
          </div>

          <NetWorthChart
            points={history}
            active={active}
            onActive={setActive}
            format={format}
            hide={hide}
            emptyTitle={t("nw.noHistory")}
            emptyDesc={t("nw.noHistoryDesc")}
            labels={{ assets: t("nw.assets"), liabilities: t("nw.liabilities"), net: t("nw.total") }}
            locale={currency.locale}
          />
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold">{t("nw.section.assets")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <AssetTile icon={<Coins className="h-4 w-4" />} label={t("nw.cash")} value={format(b.cash)} tint="#22c55e" />
          <AssetTile icon={<Landmark className="h-4 w-4" />} label={t("nw.bank")} value={format(b.bank)} tint="#3b82f6" />
          <AssetTile icon={<TrendingUp className="h-4 w-4" />} label={t("nw.investments")} value={format(b.invest)} tint="#a855f7" />
          <AssetTile icon={<Bitcoin className="h-4 w-4" />} label={t("nw.crypto")} value={format(b.crypto)} tint="#f59e0b" />
          <AssetTile icon={<Home className="h-4 w-4" />} label={t("nw.property")} value="—" tint="#14b8a6" muted />
          <AssetTile icon={<Car className="h-4 w-4" />} label={t("nw.vehicles")} value="—" tint="#eab308" muted />
        </div>
      </section>

      <section className="mt-8 px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("nw.liabilities")}</h2>
          <LiabilityDialog
            defaultCurrency={currency.code as CurrencyCode}
            onSave={(l) => { addLiability(l); toast.success(t("nw.added")); }}
          />
        </div>
        {state.liabilities.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-6 text-center">
            <p className="text-sm font-semibold">{t("nw.debtFree")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("nw.debtFreeDesc")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
            {state.liabilities.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setEditing(l)}
                  aria-label={t("nw.edit")}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-destructive/15 text-destructive">
                    {l.type === "credit_card" ? <CreditCard className="h-4 w-4" /> : l.type === "mortgage" ? <Building2 className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.apr != null ? `${l.apr}% APR` : ""}
                      {l.minPayment != null
                        ? `${l.apr != null ? " · " : ""}${t("nw.minPayment")}: ${formatIn(l.minPayment, liabilityCurrency(l))}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-destructive">
                    −{maskAmount(hide, formatIn(l.balance, liabilityCurrency(l)), "md")}
                  </span>
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: `${t("action.delete")} "${l.name}"?`,
                      description: t("nw.deleteDesc"),
                      confirmLabel: t("action.delete"),
                      destructive: true,
                    });
                    if (ok) {
                      deleteLiability(l.id);
                      toast.message(t("nw.removed"));
                    }
                  }}
                  className="ml-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
                  aria-label={t("action.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <LiabilityDialog
          key={editing.id}
          defaultCurrency={currency.code as CurrencyCode}
          initial={editing}
          openExternally
          onClose={() => setEditing(null)}
          onSave={(l) => {
            updateLiability({ ...editing, ...l });
            toast.success(t("nw.updated"));
          }}
        />
      ) : null}
    </AppShell>
  );
}


type HistPoint = { date: string; assets: number; liabilities: number; net: number };

function NetWorthChart({
  points,
  active,
  onActive,
  format,
  hide,
  emptyTitle,
  emptyDesc,
  labels,
  locale,
}: {
  points: HistPoint[];
  active: number | null;
  onActive: (i: number | null) => void;
  format: (n: number) => string;
  hide: boolean;
  emptyTitle: string;
  emptyDesc: string;
  labels: { assets: string; liabilities: string; net: string };
  locale: string;
}) {
  if (points.length < 2) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/25 bg-white/5 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-white">{emptyTitle}</p>
        <p className="mt-1 text-xs text-white/70">{emptyDesc}</p>
      </div>
    );
  }

  const W = 300;
  const H = 120;
  const vals = points.map((p) => p.net);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => (1 - (v - (min - pad)) / (max - min + pad * 2)) * H;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.net)}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;
  const sel = active != null && points[active] ? points[active] : null;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onActive(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full touch-none"
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") pick(e.clientX, e.currentTarget); }}
        onPointerLeave={() => onActive(null)}
      >
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#nwFill)" />
        <path d={path} fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {sel && active != null ? (
          <g>
            <line x1={x(active)} y1={0} x2={x(active)} y2={H} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
            <circle cx={x(active)} cy={y(sel.net)} r="4" fill="white" />
          </g>
        ) : null}
      </svg>
      {sel ? (
        <div className="mt-2 rounded-2xl bg-white/15 px-3 py-2 text-[11px] text-white">
          <p className="font-semibold">
            {new Date(`${sel.date}T00:00:00`).toLocaleDateString(locale, {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
          <p className="mt-0.5 text-white/80">
            {labels.assets} {maskAmount(hide, format(sel.assets), "md")} · {labels.liabilities}{" "}
            {maskAmount(hide, format(sel.liabilities), "md")} · {labels.net}{" "}
            {maskAmount(hide, format(sel.net), "md")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AssetTile({
  icon,
  label,
  value,
  tint,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
      <div
        className="grid h-8 w-8 place-items-center rounded-xl"
        style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}
      >
        {icon}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tracking-tight ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </p>
    </div>
  );
}

type LiabilityDraft = {
  name: string;
  type: LiabilityType;
  balance: number;
  currency: CurrencyCode;
  apr?: number;
  minPayment?: number;
};

function LiabilityDialog({
  onSave,
  defaultCurrency,
  initial,
  openExternally,
  onClose,
}: {
  defaultCurrency: CurrencyCode;
  initial?: Liability;
  openExternally?: boolean;
  onClose?: () => void;
  onSave: (l: LiabilityDraft) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(!!openExternally);
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<LiabilityType>(initial?.type ?? "loan");
  const [balance, setBalance] = useState(initial ? String(initial.balance) : "");
  const [apr, setApr] = useState(initial?.apr != null ? String(initial.apr) : "");
  const [minPay, setMinPay] = useState(initial?.minPayment != null ? String(initial.minPayment) : "");
  const [cur, setCur] = useState<CurrencyCode>(
    initial ? liabilityCurrency(initial) : defaultCurrency,
  );

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      {openExternally ? null : (
        <DialogTrigger asChild>
          <button className="flex items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium">
            <Plus className="h-3.5 w-3.5" /> {t("action.add")}
          </button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? t("nw.edit") : t("nw.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("nw.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("nw.namePlaceholder")} />
          </div>
          <div>
            <Label>{t("nw.type")}</Label>
            <div className="mt-1 flex gap-2 text-xs">
              {(["loan", "credit_card", "mortgage"] as LiabilityType[]).map((tp) => (
                <button
                  key={tp}
                  onClick={() => setType(tp)}
                  className={`flex-1 rounded-full border px-3 py-1.5 capitalize ${
                    type === tp ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {t(`nw.${tp}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("nw.balance")}</Label>
            <Input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder={t("nw.balancePlaceholder")} />
          </div>
          <div>
            <Label>{t("nw.currency")}</Label>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCur(c.code)}
                  className={`rounded-full border px-3 py-1.5 ${
                    cur === c.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("nw.apr")}</Label>
            <Input value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" placeholder={t("nw.aprPlaceholder")} />
          </div>
          <div>
            <Label>{t("nw.minPayment")}</Label>
            <Input
              value={minPay}
              onChange={(e) => setMinPay(e.target.value)}
              inputMode="decimal"
              placeholder={t("nw.minPaymentPlaceholder")}
            />
          </div>
          <Button
            onClick={() => {
              const bal = parseFloat(balance);
              if (!name || !isFinite(bal)) return;
              onSave({
                name,
                type,
                balance: bal,
                currency: cur,
                apr: parseFloat(apr) || undefined,
                minPayment: parseFloat(minPay) || undefined,
              });
              change(false);
              if (!initial) { setName(""); setBalance(""); setApr(""); setMinPay(""); }
            }}
            className="w-full"
          >
            {t("action.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}