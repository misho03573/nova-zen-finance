import { cn } from "@/lib/utils";

export function PreviewBadge({ className, label = "Preview" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary",
        className,
      )}
    >
      {label}
    </span>
  );
}