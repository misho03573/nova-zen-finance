/**
 * Bank CSV parsing helpers.
 *
 * Handles the messy reality of real bank exports:
 *  - delimiter detection (`,`, `;`, tab, `|`)
 *  - RFC4180 quoted fields (commas / newlines / escaped quotes inside values)
 *  - header-based column mapping in several languages, with positional fallback
 *  - separate debit/credit columns
 *  - EU decimal formats ("1.234,56", "-1 234,56"), trailing minus, (123,45)
 *  - day-first vs month-first date disambiguation
 */

export type ParsedRow = { date: string; title: string; amount: number };

export type ParseResult = {
  rows: ParsedRow[];
  skipped: number;
  delimiter: string;
  columns: { date: string; description: string; amount: string } | null;
};

const DELIMITERS = [",", ";", "\t", "|"];

/** Splits CSV text into records, honouring quotes (incl. embedded newlines). */
export function splitRecords(text: string, delim: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) out.push(row);
  return out.map((r) => r.map((f) => f.trim()));
}

export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = splitRecords(line, d)[0]?.length ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

const DATE_HEADERS = /^(date|booking date|value date|transaction date|datum|buchungstag|fecha|дата|date d'op|date de)/i;
const DESC_HEADERS = /(description|desc|merchant|payee|details|narrative|reference|verwendungszweck|beschreibung|concepto|libell|описание|получател)/i;
const AMOUNT_HEADERS = /^(amount|value|betrag|montant|importe|sum|сума)/i;
const DEBIT_HEADERS = /(debit|withdrawal|paid out|soll|d[ée]bit|cargo|разход)/i;
const CREDIT_HEADERS = /(credit|deposit|paid in|haben|cr[ée]dit|abono|приход)/i;

/** Parses "1.234,56", "1,234.56", "(45.00)", "45.00-", "€ 12,30". */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s\u00a0]/g, "").replace(/[^\d.,\-()+]/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  s = s.replace(/^\+/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.length > 4 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && s.length > 4) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function build(y: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, month - 1, day, 12));
  return isNaN(+d) ? null : d.toISOString();
}

/** Parses ISO, dd/mm/yyyy, mm/dd/yyyy and dd.mm.yyyy dates into an ISO string. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12) return build(y, b, a);
    return build(y, a, b);
  }
  const d = new Date(s);
  return isNaN(+d) ? null : d.toISOString();
}

export function parseBankCsv(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const records = splitRecords(text, delimiter);
  if (!records.length) return { rows: [], skipped: 0, delimiter, columns: null };

  const head = records[0];
  const lower = head.map((h) => h.toLowerCase().trim());
  let dateIdx = lower.findIndex((h) => DATE_HEADERS.test(h));
  let descIdx = lower.findIndex((h) => DESC_HEADERS.test(h));
  const amountIdx = lower.findIndex((h) => AMOUNT_HEADERS.test(h));
  const debitIdx = lower.findIndex((h) => DEBIT_HEADERS.test(h));
  const creditIdx = lower.findIndex((h) => CREDIT_HEADERS.test(h));
  const hasHeader = dateIdx > -1 || descIdx > -1 || amountIdx > -1 || debitIdx > -1;

  if (!hasHeader) {
    dateIdx = 0;
    descIdx = 1;
  } else {
    if (dateIdx < 0) dateIdx = 0;
    if (descIdx < 0) descIdx = head.length > 1 ? 1 : 0;
  }
  const amtIdx = hasHeader ? amountIdx : 2;

  const body = hasHeader ? records.slice(1) : records;
  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const r of body) {
    const date = parseDate(r[dateIdx] ?? "");
    const title = (r[descIdx] ?? "").replace(/\s+/g, " ").trim();
    let amount: number | null = amtIdx > -1 ? parseAmount(r[amtIdx] ?? "") : null;
    if (!amount && (debitIdx > -1 || creditIdx > -1)) {
      const debit = debitIdx > -1 ? parseAmount(r[debitIdx] ?? "") : null;
      const credit = creditIdx > -1 ? parseAmount(r[creditIdx] ?? "") : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (!date || !title || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    rows.push({ date, title, amount });
  }

  return {
    rows,
    skipped,
    delimiter,
    columns: hasHeader
      ? {
          date: head[dateIdx] ?? "",
          description: head[descIdx] ?? "",
          amount:
            amountIdx > -1
              ? head[amountIdx] ?? ""
              : [debitIdx, creditIdx]
                  .filter((i) => i > -1)
                  .map((i) => head[i])
                  .join(" / "),
        }
      : null,
  };
}

/** Normalised key used for duplicate detection (case/punctuation insensitive). */
export function dupeKey(title: string, amount: number): string {
  const t = title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${t}|${amount.toFixed(2)}`;
}

const DAY = 86_400_000;

export function buildExistingIndex(
  txs: { title: string; amount: number; date: string }[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const t of txs) {
    const k = dupeKey(t.title, t.amount);
    const list = map.get(k) ?? [];
    list.push(+new Date(t.date));
    map.set(k, list);
  }
  return map;
}

/** True when an entry with the same normalised title+amount exists within ±1 day. */
export function isDuplicate(
  row: { date: string; title: string; amount: number },
  existing: Map<string, number[]>,
): boolean {
  const times = existing.get(dupeKey(row.title, row.amount));
  if (!times) return false;
  const t = +new Date(row.date);
  return times.some((x) => Math.abs(x - t) <= DAY);
}