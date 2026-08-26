import { cn } from "@/lib/utils";

/**
 * NOVA brand mark — a ribbon "N" drawn as a single continuous stroke.
 * Purely presentational; inherits `currentColor`.
 */
export function NovaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
    >
      <path
        d="M7 25V9.5c0-1.3 1.6-1.9 2.5-1L23 22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M25 7v15.5c0 1.3-1.6 1.9-2.5 1L9 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
