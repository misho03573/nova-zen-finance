import { Search, SlidersHorizontal, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCategories } from "@/lib/categories";
import { useCategoryName } from "@/lib/i18n";
import { useNova, accountCurrency } from "@/lib/nova-store";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { emptyFilters, filtersActive, toggle, type TxFilters, type TxKind } from "@/lib/tx-filters";

type Props = {
  filters: TxFilters;
  update: (patch: Partial<TxFilters> | ((p: TxFilters) => TxFilters)) => void;
  reset: () => void;
  open: boolean;
  onToggleOpen: () => void;
};

function Pill({
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
          : "border-border bg-card/60 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function TxFilterPanel({ filters, update, reset, open, onToggleOpen }: Props) {
  const t = useT();
  const { state } = useNova();
  const categories = useCategories();
  const catName = useCategoryName();

  const usedCurrencies = Array.from(
    new Set(state.accounts.map((a) => accountCurrency(a))),
  ) as CurrencyCode[];

  const kinds: TxKind[] = ["income", "expense", "transfer"];
  const kindLabel: Record<TxKind, string> = {
    income: t("filt.type.income"),
    expense: t("filt.type.expense"),
    transfer: t("filt.type.transfer"),
  };

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.query.trim())
    chips.push({
      key: "q",
      label: `“${filters.query.trim()}”`,
      clear: () => update({ query: "" }),
    });
  if (filters.from)
    chips.push({
      key: "from",
      label: `${t("filt.from")}: ${filters.from}`,
      clear: () => update({ from: "" }),
    });
  if (filters.to)
    chips.push({
      key: "to",
      label: `${t("filt.to")}: ${filters.to}`,
      clear: () => update({ to: "" }),
    });
  for (const k of filters.kinds)
    chips.push({
      key: `k-${k}`,
      label: kindLabel[k],
      clear: () => update((p) => ({ ...p, kinds: p.kinds.filter((x) => x !== k) })),
    });
  for (const c of filters.categories) {
    const def = categories.find((x) => x.id === c);
    chips.push({
      key: `c-${c}`,
      label: def ? catName(def.id, def.name, def.builtin) : c,
      clear: () => update((p) => ({ ...p, categories: p.categories.filter((x) => x !== c) })),
    });
  }
  for (const a of filters.accounts) {
    const def = state.accounts.find((x) => x.id === a);
    chips.push({
      key: `a-${a}`,
      label: def?.name ?? a,
      clear: () => update((p) => ({ ...p, accounts: p.accounts.filter((x) => x !== a) })),
    });
  }
  for (const cur of filters.currencies)
    chips.push({
      key: `cur-${cur}`,
      label: cur,
      clear: () => update((p) => ({ ...p, currencies: p.currencies.filter((x) => x !== cur) })),
    });

  return (
    <section className="mt-3 space-y-3 px-5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2 backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder={t("filt.searchPlaceholder")}
            aria-label={t("filt.search")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {filters.query ? (
            <button
              onClick={() => update({ query: "" })}
              aria-label={t("filt.clearAll")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <button
          onClick={onToggleOpen}
          aria-label={t("filt.title")}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl border backdrop-blur transition-colors",
            open || filtersActive({ ...filters, query: "" })
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border bg-card/60 text-muted-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={c.clear}
              className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs text-primary"
              aria-label={`${t("filt.remove")}: ${c.label}`}
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={reset}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("filt.clearAll")}
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="animate-fade-in space-y-4 rounded-3xl border border-border bg-card/70 p-4 backdrop-blur">
          <Row label={t("filt.dateRange")}>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("filt.from")}
              <input
                type="date"
                value={filters.from}
                onChange={(e) => update({ from: e.target.value })}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("filt.to")}
              <input
                type="date"
                value={filters.to}
                onChange={(e) => update({ to: e.target.value })}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
          </Row>

          <Row label={t("filt.type")}>
            {kinds.map((k) => (
              <Pill
                key={k}
                active={filters.kinds.includes(k)}
                onClick={() => update((p) => ({ ...p, kinds: toggle(p.kinds, k) }))}
              >
                {kindLabel[k]}
              </Pill>
            ))}
          </Row>

          <Row label={t("filt.category")}>
            {categories.map((c) => (
              <Pill
                key={c.id}
                active={filters.categories.includes(c.id)}
                onClick={() => update((p) => ({ ...p, categories: toggle(p.categories, c.id) }))}
              >
                {catName(c.id, c.name, c.builtin)}
              </Pill>
            ))}
          </Row>

          <Row label={t("filt.account")}>
            {state.accounts.map((a) => (
              <Pill
                key={a.id}
                active={filters.accounts.includes(a.id)}
                onClick={() => update((p) => ({ ...p, accounts: toggle(p.accounts, a.id) }))}
              >
                {a.name}
              </Pill>
            ))}
          </Row>

          <Row label={t("filt.currency")}>
            {(usedCurrencies.length ? usedCurrencies : CURRENCIES.map((c) => c.code)).map(
              (code) => (
                <Pill
                  key={code}
                  active={filters.currencies.includes(code)}
                  onClick={() => update((p) => ({ ...p, currencies: toggle(p.currencies, code) }))}
                >
                  {code}
                </Pill>
              ),
            )}
          </Row>

          <div className="flex justify-end">
            <button
              onClick={() => update(() => emptyFilters)}
              className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("filt.clearAll")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function Highlight({ parts }: { parts: { text: string; hit: boolean }[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-primary/25 px-0.5 text-primary">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
