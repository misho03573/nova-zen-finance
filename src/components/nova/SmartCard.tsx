import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlertTriangle, Info, Sparkles, TrendingUp } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { useT, fmt } from "@/lib/i18n";
import { useCategoryName } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SmartSeverity = "good" | "info" | "warn" | "critical";

export type SmartCardItem = {
  id: string;
  severity: SmartSeverity;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  money: string[];
  route?: string;
};

const TONE: Record<SmartSeverity, string> = {
  critical: "border-danger/40 bg-danger/10 text-danger",
  warn: "border-warning/40 bg-warning/10 text-warning",
  good: "border-success/40 bg-success/10 text-success",
  info: "border-border bg-card/70 text-primary",
};

function icon(sev: SmartSeverity) {
  if (sev === "critical" || sev === "warn") return <AlertTriangle className="h-4 w-4" />;
  if (sev === "good") return <TrendingUp className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

/**
 * Renders one deterministic insight / notification. Currency params are
 * formatted with the active display currency and category params are
 * translated, so engines stay language-agnostic.
 */
export function SmartCard({
  item,
  trailing,
  onClick,
}: {
  item: SmartCardItem;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const { format } = useCurrency();
  const t = useT();
  const catName = useCategoryName();

  const params: Record<string, string | number> = { ...item.params };
  for (const key of item.money) {
    if (typeof params[key] === "number") params[key] = format(params[key] as number);
  }
  if (typeof params.category === "string") {
    params.category = catName(params.category, params.category, true);
  }

  const body = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border",
          TONE[item.severity],
        )}
      >
        {icon(item.severity)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {fmt(t(item.titleKey), params)}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {fmt(t(item.bodyKey), params)}
        </span>
      </span>
      {trailing}
    </div>
  );

  const base =
    "block w-full rounded-2xl border border-border bg-card/70 p-3 text-left shadow-[var(--shadow-card)]";

  if (item.route) {
    return (
      <Link to={item.route} className={cn(base, "press")} onClick={onClick}>
        {body}
      </Link>
    );
  }
  return (
    <div className={base} onClick={onClick}>
      {body}
    </div>
  );
}

export function SmartEmpty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
