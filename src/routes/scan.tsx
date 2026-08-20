import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Camera, Sparkles, Check, RefreshCw } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { useCategoryLookup, useCategories } from "@/lib/categories";
import { iconRegistry } from "@/lib/categories";
import { useCategoryName, useT, fmt } from "@/lib/i18n";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan Receipt · NOVA" },
      { name: "description", content: "AI-powered receipt scanner." },
    ],
  }),
  component: ScanPage,
});

type Detected = {
  merchant: string;
  date: string;
  total: number;
  vat: number;
  currency: string;
  category: string;
  paymentMethod: string;
};

const MOCK_RECEIPTS: Detected[] = [
  { merchant: "Blue Bottle Coffee", date: new Date().toISOString(), total: 12.4, vat: 2.07, currency: "USD", category: "coffee", paymentMethod: "Visa •• 4821" },
  { merchant: "Whole Foods Market", date: new Date().toISOString(), total: 68.2, vat: 5.68, currency: "USD", category: "food", paymentMethod: "Visa •• 4821" },
  { merchant: "Shell Gas Station", date: new Date().toISOString(), total: 54.9, vat: 9.15, currency: "USD", category: "transport", paymentMethod: "Amex" },
  { merchant: "Aesop", date: new Date().toISOString(), total: 142, vat: 23.67, currency: "USD", category: "shopping", paymentMethod: "Revolut" },
];

function ScanPage() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "detected">("idle");
  const [receipt, setReceipt] = useState<Detected | null>(null);
  const { state, addTransaction } = useNova();
  const { format, currency } = useCurrency();
  const navigate = useNavigate();
  const categoryOf = useCategoryLookup();
  const categories = useCategories("expense");
  const catName = useCategoryName();
  const tr = useT();

  const start = () => {
    setPhase("scanning");
    setTimeout(() => {
      const r = { ...MOCK_RECEIPTS[Math.floor(Math.random() * MOCK_RECEIPTS.length)], currency: currency.code };
      setReceipt(r);
      setPhase("detected");
    }, 1800);
  };

  const save = () => {
    if (!receipt) return;
    addTransaction({
      title: receipt.merchant,
      category: receipt.category,
      amount: -receipt.total,
      date: receipt.date,
      accountId: state.accounts[0]?.id ?? "c1",
      note: `VAT ${format(receipt.vat)} · ${receipt.paymentMethod}`,
    });
    toast.success(fmt(tr("scan.saved"), { amount: format(receipt.total), merchant: receipt.merchant }));
    navigate({ to: "/wallet" });
  };

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("scan.subtitle")}
        title={tr("scan.title")}
        right={
          <Link
            to="/"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <section className="px-5">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
          <div
            className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border"
            style={{ background: "radial-gradient(120% 60% at 50% 0%, oklch(0.28 0.05 260 / 0.5), transparent 60%), var(--gradient-card)" }}
          >
            {phase === "idle" && (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full border border-border bg-background/60">
                  <Camera className="h-6 w-6 text-primary" />
                </span>
                <p className="text-sm font-medium">{tr("scan.point")}</p>
                <p className="max-w-[240px] text-xs text-muted-foreground">
                  {tr("scan.pointDesc")}
                </p>
              </div>
            )}
            {phase === "scanning" && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative h-24 w-24">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <div className="relative grid h-24 w-24 place-items-center rounded-full border border-primary/40 bg-primary/10">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <p className="text-sm font-medium">{tr("scan.analyzing")}</p>
                <p className="text-xs text-muted-foreground">{tr("scan.reading")}</p>
              </div>
            )}
            {phase === "detected" && receipt && (
              <div className="w-full max-w-[280px] rounded-2xl border border-border bg-background/80 p-4 text-sm shadow-[var(--shadow-elevated)] backdrop-blur animate-fade-in">
                <p className="text-[10px] uppercase tracking-widest text-primary">{tr("scan.detected")}</p>
                <p className="mt-1 text-lg font-semibold">{receipt.merchant}</p>
                <p className="text-xs text-muted-foreground">{new Date(receipt.date).toLocaleString()}</p>
                <div className="mt-3 space-y-1.5 text-xs">
                  <RowKV label={tr("scan.total")} value={format(receipt.total)} />
                  <RowKV label={tr("scan.vat")} value={format(receipt.vat)} />
                  <RowKV label={tr("scan.currency")} value={receipt.currency} />
                  <RowKV label={tr("scan.category")} value={(() => { const c = categoryOf(receipt.category); return catName(c.id, c.name, c.builtin); })()} />
                  <RowKV label={tr("scan.payment")} value={receipt.paymentMethod} />
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === "detected" && receipt && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {categories.slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => setReceipt({ ...receipt, category: c.id })}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${
                  receipt.category === c.id ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {(() => { const I = iconRegistry[c.icon] ?? iconRegistry.Tag; return <I className="h-3 w-3" style={{ color: c.color }} />; })()}
                <span className="truncate">{catName(c.id, c.name, c.builtin)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          {phase === "detected" ? (
            <>
              <button
                onClick={() => { setPhase("idle"); setReceipt(null); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card/60 py-3 text-sm font-medium"
              >
                <RefreshCw className="h-4 w-4" /> {tr("scan.rescan")}
              </button>
              <button
                onClick={save}
                className="flex flex-[2] items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Check className="h-4 w-4" /> {tr("scan.save")}
              </button>
            </>
          ) : (
            <button
              disabled={phase === "scanning"}
              onClick={start}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Camera className="h-4 w-4" />
              {phase === "scanning" ? tr("scan.scanning") : tr("scan.capture")}
            </button>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}