import { Check, Coins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function CurrencyPicker({ variant = "icon" }: { variant?: "icon" | "chip" }) {
  const { currency, setCurrency } = useCurrency();
  const t = useT();

  return (
    <Dialog>
      <DialogTrigger asChild>
        {variant === "chip" ? (
          <button
            className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-2 text-xs font-medium backdrop-blur transition-colors hover:bg-card"
            aria-label={t("cur.aria")}
          >
            <span className="text-base leading-none">{currency.flag}</span>
            <span>{currency.code}</span>
            <span className="text-muted-foreground">{currency.symbol}</span>
          </button>
        ) : (
          <button
            className="tap grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 text-foreground backdrop-blur transition-colors hover:bg-card"
            aria-label={t("cur.aria")}
          >
            <Coins className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm border-border bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" /> {t("cur.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("cur.aria")}</DialogDescription>
        </DialogHeader>
        <ul className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {CURRENCIES.map((c) => {
            const active = c.code === currency.code;
            return (
              <li key={c.code}>
                <button
                  onClick={() => setCurrency(c.code)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card/60 hover:bg-card",
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-background text-lg">
                    {c.flag}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.code} · {c.symbol}
                    </span>
                  </span>
                  {active ? (
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full text-primary-foreground"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}