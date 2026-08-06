import { useCallback, useEffect, useState } from "react";
import type { Transaction, Account } from "@/lib/nova-store";
import type { CurrencyCode } from "@/lib/currency";

export type TxKind = "income" | "expense" | "transfer";

export type TxFilters = {
  query: string;
  from: string; // ISO date (yyyy-mm-dd) or ""
  to: string;
  kinds: TxKind[];
  categories: string[];
  accounts: string[];
  currencies: CurrencyCode[];
};

export const emptyFilters: TxFilters = {
  query: "",
  from: "",
  to: "",
  kinds: [],
  categories: [],
  accounts: [],
  currencies: [],
};

export function kindOf(t: Transaction): TxKind {
  if (t.transferId) return "transfer";
  return t.amount >= 0 ? "income" : "expense";
}

export function filtersActive(f: TxFilters): boolean {
  return (
    f.query.trim() !== "" ||
    f.from !== "" ||
    f.to !== "" ||
    f.kinds.length > 0 ||
    f.categories.length > 0 ||
    f.accounts.length > 0 ||
    f.currencies.length > 0
  );
}

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/**
 * Free-text haystack: merchant/title, note, category name and account name.
 * Names are resolved by the caller so custom categories and renamed accounts
 * are searchable in the user's own language.
 */
export type NameLookup = {
  categoryName: (id: string) => string;
  accountName: (id: string) => string;
};

export function matchesFilters(
  t: Transaction,
  f: TxFilters,
  accounts: Account[],
  names: NameLookup,
): boolean {
  if (f.kinds.length && !f.kinds.includes(kindOf(t))) return false;
  if (f.categories.length && !f.categories.includes(t.category)) return false;
  if (f.accounts.length && !f.accounts.includes(t.accountId)) return false;
  if (f.currencies.length) {
    const cur =
      t.currency ?? accounts.find((a) => a.id === t.accountId)?.currency ?? "USD";
    if (!f.currencies.includes(cur as CurrencyCode)) return false;
  }
  const day = t.date.slice(0, 10);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;

  const q = f.query.trim().toLowerCase();
  if (q) {
    const hay = [
      t.title,
      t.note ?? "",
      names.categoryName(t.category),
      names.accountName(t.accountId),
    ]
      .join(" ")
      .toLowerCase();
    if (!q.split(/\s+/).every((tok) => hay.includes(tok))) return false;
  }
  return true;
}

/** Splits a string into matched / unmatched segments for highlighting. */
export function highlightParts(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const tok of tokens) {
    let i = lower.indexOf(tok);
    while (i !== -1) {
      for (let j = i; j < i + tok.length; j++) marks[j] = true;
      i = lower.indexOf(tok, i + tok.length);
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  let buf = "";
  let cur = marks[0] ?? false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] === cur) buf += text[i];
    else {
      out.push({ text: buf, hit: cur });
      buf = text[i];
      cur = marks[i];
    }
  }
  if (buf) out.push({ text: buf, hit: cur });
  return out;
}

const KEY_PREFIX = "nova.txfilters.v1";

/** Persists the last used filters per signed-in user (guests share one slot). */
export function useTxFilters(userId?: string | null) {
  const storageKey = `${KEY_PREFIX}.${userId ?? "guest"}`;
  const [filters, setFilters] = useState<TxFilters>(emptyFilters);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setFilters(raw ? { ...emptyFilters, ...JSON.parse(raw) } : emptyFilters);
    } catch {
      setFilters(emptyFilters);
    }
  }, [storageKey]);

  const update = useCallback(
    (patch: Partial<TxFilters> | ((prev: TxFilters) => TxFilters)) => {
      setFilters((prev) => {
        const next =
          typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  const reset = useCallback(() => update(() => emptyFilters), [update]);

  return { filters, update, reset };
}
