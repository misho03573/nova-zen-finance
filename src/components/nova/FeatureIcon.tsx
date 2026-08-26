import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const BOX: Record<Size, string> = {
  sm: "h-9 w-9 rounded-[0.9rem]",
  md: "h-11 w-11 rounded-[1.1rem]",
  lg: "h-14 w-14 rounded-[1.35rem]",
  xl: "h-24 w-24 rounded-[2rem]",
};

const GLYPH: Record<Size, string> = {
  sm: "[&_svg]:h-4 [&_svg]:w-4",
  md: "[&_svg]:h-[1.15rem] [&_svg]:w-[1.15rem]",
  lg: "[&_svg]:h-6 [&_svg]:w-6",
  xl: "[&_svg]:h-10 [&_svg]:w-10",
};

/**
 * NOVA feature icon — the single squircle container used for every icon
 * tile in the app (onboarding, list rows, settings, quick actions).
 * Thin-stroke glyph, emerald on a recessed charcoal tile.
 */
export function FeatureIcon({
  children,
  size = "md",
  tone = "brand",
  className,
}: {
  children: ReactNode;
  size?: Size;
  tone?: "brand" | "muted" | "solid";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center border",
        BOX[size],
        GLYPH[size],
        "[&_svg]:stroke-[1.6]",
        tone === "solid"
          ? "border-transparent text-primary-foreground"
          : tone === "muted"
            ? "border-border bg-muted/60 text-muted-foreground"
            : "border-primary/15 text-primary",
        className,
      )}
      style={
        tone === "solid"
          ? { background: "var(--gradient-primary)" }
          : tone === "brand"
            ? { background: "var(--gradient-tile)" }
            : undefined
      }
    >
      {children}
    </span>
  );
}
