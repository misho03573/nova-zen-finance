import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type CtaTo =
  | "/"
  | "/wallet"
  | "/add"
  | "/insights"
  | "/goals"
  | "/settings"
  | "/calendar"
  | "/stats"
  | "/ai"
  | "/scan"
  | "/networth"
  | "/import"
  | "/automation"
  | "/runway"
  | "/subscriptions";

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaTo,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaTo?: CtaTo;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-10 text-center",
        className,
      )}
    >
      <FeatureIcon size="lg" className="mb-4">
        {icon}
      </FeatureIcon>

      <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 max-w-[26ch] text-sm text-muted-foreground">{description}</p>
      {ctaLabel && ctaTo ? (
        <Link
          to={ctaTo}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.02]"
          style={{ background: "var(--gradient-primary)" }}
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}