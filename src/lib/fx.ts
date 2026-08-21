import { EXCHANGE_RATES, type CurrencyCode } from "@/lib/currency";

/**
 * FX abstraction layer.
 *
 * All historical accounting in NOVA goes through this module so that FX logic
 * never gets scattered across routes. Today the rate source is a local static
 * table (deterministic, offline). The `FxMeta` envelope is deliberately shaped
 * so a live or historical FX provider can be plugged in later without changing
 * any stored record: a snapshot always explains, in its own payload, which
 * rates produced its numbers.
 */

/** Neutral base currency every historical value is frozen into. */
export const FX_BASE: CurrencyCode = "USD";

/** Bumped whenever the static rate table changes. Stored with each snapshot. */
export const FX_VERSION = 1;

/** Where the rates came from. Future values: "live", "historical". */
export const FX_SOURCE = "static-table-v1";

export type FxMeta = {
  version: number;
  source: string;
  /** Currency the rates are expressed against (rate = units per 1 base). */
  base: CurrencyCode;
  /** ISO timestamp at which the rates were captured. */
  capturedAt: string;
  /** Rate table snapshot used for this capture. */
  rates: Partial<Record<CurrencyCode, number>>;
};

/** Rate table as of right now, copied (never referenced) into the snapshot. */
export function currentFxMeta(at: Date = new Date()): FxMeta {
  return {
    version: FX_VERSION,
    source: FX_SOURCE,
    base: FX_BASE,
    capturedAt: at.toISOString(),
    rates: { ...EXCHANGE_RATES },
  };
}

/** Rates from a frozen meta, falling back to the live table when absent. */
export function ratesOf(meta?: FxMeta | null): Partial<Record<CurrencyCode, number>> {
  return meta?.rates && Object.keys(meta.rates).length > 0 ? meta.rates : EXCHANGE_RATES;
}

/**
 * Convert using a specific (possibly frozen) rate basis.
 * `meta === undefined | null` means "use today's rates".
 */
export function convertWith(
  n: number,
  from: CurrencyCode,
  to: CurrencyCode,
  meta?: FxMeta | null,
): number {
  if (from === to) return n;
  const rates = ratesOf(meta);
  const fromRate = rates[from] ?? EXCHANGE_RATES[from] ?? 1;
  const toRate = rates[to] ?? EXCHANGE_RATES[to] ?? 1;
  return (n / fromRate) * toRate;
}

/** A record captured before FX metadata existed: value preserved, basis unknown. */
export function isLegacyFx(meta?: FxMeta | null): boolean {
  return !meta || !meta.rates || Object.keys(meta.rates).length === 0;
}
