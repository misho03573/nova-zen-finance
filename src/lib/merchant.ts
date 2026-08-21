/**
 * Merchant intelligence.
 *
 * Bank descriptors are noisy: `LIDL 1248 SOFIA`, `LIDL BG #5521`,
 * `Lidl Store` and `LIDL*0820` all mean the same shop. This module turns a
 * raw descriptor into a stable *merchant key* plus a human display label,
 * without ever mutating or losing the original description — every caller
 * keeps the raw text for audit and only uses the derived identity for
 * grouping, search, rules, detection and reporting.
 *
 * The cleanup is deliberately conservative: it strips reference numbers,
 * terminal ids, processor prefixes and legal/geo suffixes, but it never
 * reduces a name below its first meaningful token.
 */

export type MerchantAlias = {
  id: string;
  /** Canonical key this identity resolves to. */
  key: string;
  /** User-facing display name; overrides the derived label. */
  name: string;
  /** Additional keys merged into this identity. */
  aliases: string[];
};

export type MerchantIdentity = {
  /** Stable lowercase alphanumeric identity. */
  key: string;
  /** Display label (user override, else derived). */
  label: string;
  /** Label derived purely from the descriptor, before user overrides. */
  derived: string;
  /** Untouched source descriptor. */
  raw: string;
};

/** Payment-processor and channel prefixes that carry no merchant meaning. */
const PREFIXES = [
  "pos",
  "posd",
  "card payment to",
  "card payment",
  "payment to",
  "payment from",
  "purchase",
  "purchase at",
  "direct debit",
  "dd",
  "sepa",
  "sepa dd",
  "standing order",
  "so",
  "bank transfer",
  "transfer to",
  "transfer from",
  "debit card",
  "credit card",
  "contactless",
  "recurring payment",
  "online payment",
  "ideal",
  "visa",
  "mastercard",
  "maestro",
];

/** Aggregator prefixes written as `SQ *COFFEE`, `PAYPAL *SPOTIFY`, … */
const STAR_AGGREGATORS = new Set([
  "sq",
  "sp",
  "paypal",
  "pp",
  "sumup",
  "izettle",
  "zettle",
  "stripe",
  "toast",
  "wpy",
  "tst",
]);

const COUNTRY_CODES = new Set([
  "bg", "de", "fr", "es", "it", "uk", "gb", "us", "nl", "be", "at", "ch", "pl",
  "ro", "gr", "cz", "sk", "hu", "pt", "se", "no", "dk", "fi", "ie", "tr",
]);

const LEGAL_SUFFIXES = new Set([
  "ltd", "llc", "inc", "gmbh", "ag", "sa", "sas", "sarl", "bv", "nv", "spa",
  "srl", "plc", "co", "corp", "kg", "ug", "oy", "ab", "as", "aps",
  "eood", "ood", "ad", "et", "zad", "sl", "slu",
]);

/** Generic retail words dropped only when other tokens survive. */
const GENERIC_SUFFIXES = new Set([
  "store", "stores", "shop", "branch", "filiale", "sucursal", "magazin",
]);

const CURRENCY_TOKENS = new Set(["eur", "usd", "gbp", "bgn", "chf", "pln", "ron"]);

function isHardNoise(token: string): boolean {
  if (/^#?\d{2,}$/.test(token)) return true; // 1248, #5521
  if (/^\d+[a-z]{0,2}$/.test(token) && token.length >= 3) return true; // 0820, 12ab
  if (/^[a-z]*\d[a-z0-9]*$/.test(token) && token.length >= 4 && /\d{2,}/.test(token))
    return true; // terminal ids like t12345, ref9981
  if (/^(ref|trn|tid|auth|id|no|nr|inv)[-#:]?\d+$/.test(token)) return true;
  return false;
}

function isSoftNoise(token: string): boolean {
  return (
    COUNTRY_CODES.has(token) ||
    LEGAL_SUFFIXES.has(token) ||
    GENERIC_SUFFIXES.has(token) ||
    CURRENCY_TOKENS.has(token)
  );
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Strip diacritics so `Café` and `Cafe` resolve to one identity. */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Clean a raw descriptor into a display label. Never returns an empty string
 * for a non-empty input — when every token looks like noise the original
 * (trimmed) descriptor wins.
 */
export function cleanDescriptor(raw: string): string {
  const original = (raw ?? "").trim();
  if (!original) return "";

  let s = deaccent(original).toLowerCase();

  // `PAYPAL *SPOTIFY` → `spotify`; `LIDL*0820` → `lidl`.
  if (s.includes("*")) {
    const [head, ...rest] = s.split("*");
    const tail = rest.join("*").trim();
    const headKey = head.trim().replace(/[^a-z0-9]/g, "");
    if (STAR_AGGREGATORS.has(headKey) && tail) s = tail;
    else s = head.trim() || tail;
  }

  // Collapse punctuation runs into single spaces, keep & and - inside words.
  s = s.replace(/[^a-z0-9&\-\s]+/g, " ").replace(/\s+/g, " ").trim();

  // Drop a leading processor/channel prefix (longest match first).
  for (const p of [...PREFIXES].sort((a, b) => b.length - a.length)) {
    if (s === p) break;
    if (s.startsWith(p + " ")) {
      s = s.slice(p.length + 1);
      break;
    }
  }

  let tokens = s.split(" ").filter(Boolean);
  if (!tokens.length) return original;

  // Truncate at the first hard-noise token — everything after a reference
  // number is location/terminal detail (`lidl 1248 sofia` → `lidl`).
  const cut = tokens.findIndex((t, i) => i > 0 && isHardNoise(t));
  if (cut > 0) tokens = tokens.slice(0, cut);

  // Trim trailing soft noise while at least one token remains.
  while (tokens.length > 1 && isSoftNoise(tokens[tokens.length - 1])) tokens.pop();
  // …and leading soft noise (`bg lidl`).
  while (tokens.length > 1 && isSoftNoise(tokens[0])) tokens.shift();

  const label = tokens.join(" ").trim();
  if (!label) return original;
  return titleCase(label);
}

/** Stable identity key for a descriptor (lowercase alphanumeric). */
export function merchantKey(raw: string): string {
  return cleanDescriptor(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function aliasIndex(aliases: MerchantAlias[]): Map<string, MerchantAlias> {
  const m = new Map<string, MerchantAlias>();
  for (const a of aliases) {
    m.set(a.key, a);
    for (const k of a.aliases) m.set(k, a);
  }
  return m;
}

/**
 * Resolve a descriptor to its merchant identity, applying user renames and
 * merges. `raw` is preserved verbatim on the result.
 */
export function resolveMerchant(raw: string, aliases: MerchantAlias[] = []): MerchantIdentity {
  const derived = cleanDescriptor(raw);
  const key = derived.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = aliasIndex(aliases).get(key);
  if (hit) return { key: hit.key, label: hit.name || derived, derived, raw };
  return { key, label: derived, derived, raw };
}

export type MerchantSummary = {
  key: string;
  label: string;
  /** Distinct raw descriptors seen for this identity. */
  variants: string[];
  count: number;
  /** Sum of absolute amounts, in whatever currency the caller passed in. */
  total: number;
  lastDate: string | null;
};

/**
 * Group anything descriptor-shaped into merchant summaries, most active first.
 * Amounts must already be normalized by the caller (converted exactly once).
 */
export function summarizeMerchants(
  items: { title: string; amount: number; date: string }[],
  aliases: MerchantAlias[] = [],
): MerchantSummary[] {
  const map = new Map<string, MerchantSummary>();
  for (const it of items) {
    const id = resolveMerchant(it.title, aliases);
    if (!id.key) continue;
    const cur = map.get(id.key) ?? {
      key: id.key,
      label: id.label,
      variants: [],
      count: 0,
      total: 0,
      lastDate: null,
    };
    cur.label = id.label;
    if (it.title && !cur.variants.includes(it.title)) cur.variants.push(it.title);
    cur.count += 1;
    cur.total += Math.abs(it.amount);
    if (!cur.lastDate || it.date > cur.lastDate) cur.lastDate = it.date;
    map.set(id.key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.total - a.total);
}

/** Merge `sourceKeys` into `targetKey`, returning the next alias list. */
export function mergeAliases(
  aliases: MerchantAlias[],
  targetKey: string,
  targetName: string,
  sourceKeys: string[],
): MerchantAlias[] {
  const sources = sourceKeys.filter((k) => k && k !== targetKey);
  const rest: MerchantAlias[] = [];
  let target: MerchantAlias | null = null;
  const absorbed = new Set(sources);

  for (const a of aliases) {
    if (a.key === targetKey) target = { ...a, aliases: [...a.aliases] };
    else if (absorbed.has(a.key)) {
      // Folding a whole identity in: carry its own aliases across.
      absorbed.add(...([] as string[]));
      for (const k of a.aliases) absorbed.add(k);
    } else rest.push(a);
  }

  const merged: MerchantAlias = target ?? {
    id: `m-${targetKey}`,
    key: targetKey,
    name: targetName,
    aliases: [],
  };
  merged.name = targetName || merged.name;
  for (const k of absorbed) if (k !== targetKey && !merged.aliases.includes(k)) merged.aliases.push(k);
  return [...rest, merged];
}

/** Set (or clear) a custom display name for one merchant identity. */
export function renameMerchant(
  aliases: MerchantAlias[],
  key: string,
  name: string,
): MerchantAlias[] {
  const trimmed = name.trim();
  const existing = aliases.find((a) => a.key === key);
  if (!existing) {
    if (!trimmed) return aliases;
    return [...aliases, { id: `m-${key}`, key, name: trimmed, aliases: [] }];
  }
  if (!trimmed && existing.aliases.length === 0) return aliases.filter((a) => a.key !== key);
  return aliases.map((a) => (a.key === key ? { ...a, name: trimmed } : a));
}
