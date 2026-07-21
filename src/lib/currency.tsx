import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CAD"
  | "AUD"
  | "CHF"
  | "CNY"
  | "INR"
  | "BRL"
  | "BGN";

export type CurrencyDef = {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  flag: string;
};

export const CURRENCIES: CurrencyDef[] = [
  { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", flag: "🇺🇸" },
  { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", flag: "🇪🇺" },
  { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", flag: "🇬🇧" },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev", locale: "bg-BG", flag: "🇧🇬" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", locale: "ja-JP", flag: "🇯🇵" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar", locale: "en-CA", flag: "🇨🇦" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-AU", flag: "🇦🇺" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", locale: "de-CH", flag: "🇨🇭" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", locale: "zh-CN", flag: "🇨🇳" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN", flag: "🇮🇳" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", locale: "pt-BR", flag: "🇧🇷" },
];

// Placeholder exchange rates relative to USD. In production these would
// stream from a live FX provider.
export const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  BGN: 1.8,
  JPY: 157,
  CAD: 1.37,
  AUD: 1.52,
  CHF: 0.88,
  CNY: 7.24,
  INR: 83.4,
  BRL: 5.15,
};

const STORAGE_KEY = "nova.currency.v1";
const DEFAULT: CurrencyCode = "USD";

type Ctx = {
  currency: CurrencyDef;
  setCurrency: (code: CurrencyCode) => void;
  format: (n: number, opts?: { signed?: boolean }) => string;
  symbol: string;
};

const CurrencyContext = createContext<Ctx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<CurrencyCode>(DEFAULT);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && CURRENCIES.some((c) => c.code === raw)) {
        setCode(raw as CurrencyCode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const currency = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
    const noDecimals = currency.code === "JPY";
    const rate = EXCHANGE_RATES[currency.code] ?? 1;
    const format = (n: number, opts?: { signed?: boolean }) => {
      const converted = n * rate;
      const abs = Math.abs(converted);
      const str = abs.toLocaleString(currency.locale, {
        minimumFractionDigits: noDecimals ? 0 : 2,
        maximumFractionDigits: noDecimals ? 0 : 2,
      });
      const sign = converted < 0 ? "−" : opts?.signed ? "+" : "";
      return `${sign}${currency.symbol}${str}`;
    };
    return { currency, setCurrency, format, symbol: currency.symbol };
  }, [code, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}