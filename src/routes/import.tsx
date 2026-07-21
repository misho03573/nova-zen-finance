import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Upload, FileText, Check, AlertTriangle } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova, type Transaction } from "@/lib/nova-store";
import { useCurrency, type CurrencyCode } from "@/lib/currency";
import { toast } from "sonner";
import { categoryOf } from "@/lib/nova-data";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Bank Import · NOVA" },
      { name: "description", content: "Import transactions from your bank CSV." },
    ],
  }),
  component: ImportPage,
});

type Draft = Omit<Transaction, "id"> & { dupe: boolean };

const SAMPLE = `date,description,amount
2026-07-18,Blue Bottle Coffee,-6.50
2026-07-18,Whole Foods Market,-84.32
2026-07-17,Uber,-18.90
2026-07-15,Salary Acme Inc,6200.00
2026-07-14,Aesop,-142.00
2026-07-12,Con Edison,-96.14
2026-07-10,Trader Joe's,-52.11
2026-07-08,Shell Gas,-54.90`;

function guessCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (/coffee|starbucks|blue bottle/.test(d)) return "coffee";
  if (/uber|lyft|gas|shell|fuel|transit|metro/.test(d)) return "transport";
  if (/salary|payroll|inc\.?$|payment received/.test(d)) return "salary";
  if (/whole foods|trader|grocery|market/.test(d)) return "food";
  if (/aesop|zara|amazon|shop/.test(d)) return "shopping";
  if (/electric|water|internet|utility|edison|verizon|phone/.test(d)) return "utilities";
  if (/netflix|spotify|hulu|chatgpt|icloud/.test(d)) return "subscription";
  if (/rent|landlord/.test(d)) return "rent";
  if (/travel|hotel|airbnb|delta|united|airline/.test(d)) return "travel";
  return "bills";
}

function ImportPage() {
  const { state, importTransactions } = useNova();
  const { formatIn } = useCurrency();
  const [csv, setCsv] = useState<string>("");
  const [account, setAccount] = useState<string>(state.accounts[0]?.id ?? "");
  const navigate = useNavigate();

  const accountCur: CurrencyCode =
    (state.accounts.find((a) => a.id === account)?.currency ?? "USD") as CurrencyCode;

  const drafts: Draft[] = useMemo(() => {
    if (!csv.trim()) return [];
    const lines = csv.trim().split(/\r?\n/);
    const header = lines[0].toLowerCase();
    const hasHeader = /date|amount|description/.test(header);
    const rows = hasHeader ? lines.slice(1) : lines;
    const existing = new Set(
      state.transactions.map((t) => `${t.date.slice(0, 10)}|${t.title}|${t.amount.toFixed(2)}`),
    );
    return rows
      .map((line): Draft | null => {
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length < 3) return null;
        const [d, desc, amt] = parts;
        const amount = parseFloat(amt);
        if (!isFinite(amount)) return null;
        const parsed = new Date(d);
        if (isNaN(+parsed)) return null;
        const iso = parsed.toISOString();
        const key = `${iso.slice(0, 10)}|${desc}|${amount.toFixed(2)}`;
        return {
          title: desc,
          category: guessCategory(desc),
          amount,
          date: iso,
          accountId: account,
          currency: accountCur,
          dupe: existing.has(key),
        };
      })
      .filter((x): x is Draft => x !== null);
  }, [csv, account, accountCur, state.transactions]);

  const toImport = drafts.filter((d) => !d.dupe);

  const onFile = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    setCsv(text);
  };

  const doImport = () => {
    if (toImport.length === 0) return;
    importTransactions(toImport.map(({ dupe: _d, ...rest }) => rest));
    toast.success(`Imported ${toImport.length} transactions`);
    navigate({ to: "/wallet" });
  };

  return (
    <AppShell>
      <PageHeader
        subtitle="Bank"
        title="Import CSV"
        right={
          <Link to="/" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <section className="px-5">
        <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-dashed border-border bg-card/60 p-5 shadow-[var(--shadow-card)]">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Upload className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Upload bank CSV</p>
            <p className="text-xs text-muted-foreground">Columns: date, description, amount</p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          onClick={() => setCsv(SAMPLE)}
          className="mt-2 flex items-center gap-1.5 text-xs text-primary"
        >
          <FileText className="h-3.5 w-3.5" /> Load sample data
        </button>
      </section>

      <section className="mt-4 px-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Import into
        </p>
        <div className="flex flex-wrap gap-2">
          {state.accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccount(a.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                account === a.id ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="mt-4 px-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Preview · {drafts.length}</p>
            <p className="text-xs text-muted-foreground">
              {toImport.length} new · {drafts.length - toImport.length} duplicates
            </p>
          </div>
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
            {drafts.slice(0, 30).map((d, i) => {
              const cat = categoryOf(d.category);
              const Icon = cat.icon;
              return (
                <li key={i} className={`flex items-center gap-3 px-4 py-2.5 ${d.dupe ? "opacity-50" : ""}`}>
                  <div
                    className="grid h-8 w-8 place-items-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(d.date).toLocaleDateString()} · {cat.name}
                    </p>
                  </div>
                  {d.dupe ? (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-amber-500">
                      <AlertTriangle className="h-3 w-3" /> Dupe
                    </span>
                  ) : null}
                  <span className={`shrink-0 text-sm font-semibold ${d.amount > 0 ? "text-primary" : ""}`}>
                    {formatIn(d.amount, d.currency ?? accountCur)}
                  </span>
                </li>
              );
            })}
          </ul>

          <button
            disabled={toImport.length === 0}
            onClick={doImport}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Check className="h-4 w-4" /> Import {toImport.length} transactions
          </button>
        </section>
      )}
    </AppShell>
  );
}