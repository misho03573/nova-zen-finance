import { cn } from "@/lib/utils";

/**
 * NOVA brand mark — a ribbon "N": two uprights joined by a single folded
 * diagonal. Purely presentational; inherits `currentColor`.
 */
export function NovaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
    >
      {/* left upright */}
      <path
        d="M8 25.5V10.2c0-2 2.4-3 3.8-1.6"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* folded diagonal ribbon */}
      <path
        d="M9.4 8.6 22.6 23.4"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* right upright */}
      <path
        d="M24 6.5v15.3c0 2-2.4 3-3.8 1.6"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
