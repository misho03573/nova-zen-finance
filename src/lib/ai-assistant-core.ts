import { z } from "zod";

export const AI_LOCALES = ["en", "bg", "de", "fr", "es"] as const;

export const AskNovaInput = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  }).strict()).max(16),
  locale: z.enum(AI_LOCALES),
  currency: z.enum(["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "BGN"]),
}).strict();

export type AskNovaData = z.infer<typeof AskNovaInput>;
export type AiErrorCode = "unauthorized" | "invalid" | "rate_limited" | "credits" | "configuration" | "provider" | "empty";
export type AskNovaResult =
  | { ok: true; text: string }
  | { ok: false; code: AiErrorCode; retryable: boolean };

export function classifyAiError(error: unknown): Extract<AskNovaResult, { ok: false }> {
  const candidate = error as { statusCode?: number; status?: number } | null;
  const status = candidate?.statusCode ?? candidate?.status;
  if (status === 401) return { ok: false, code: "configuration", retryable: false };
  if (status === 402) return { ok: false, code: "credits", retryable: false };
  if (status === 429 || (typeof status === "number" && status >= 500)) {
    return { ok: false, code: "provider", retryable: true };
  }
  return { ok: false, code: "provider", retryable: false };
}

type RateEntry = { startedAt: number; count: number };
const rateEntries = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;

export function consumeAiRateLimit(userId: string, now = Date.now()): boolean {
  const current = rateEntries.get(userId);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateEntries.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

export function resetAiRateLimitsForTests() {
  rateEntries.clear();
}

export async function runAiAssistant(args: {
  userId: string;
  data: AskNovaData;
  readAggregateLines: () => Promise<string[]>;
  generate: (input: { data: AskNovaData; lines: string[] }) => Promise<string>;
}): Promise<AskNovaResult> {
  if (!args.userId) return { ok: false, code: "unauthorized", retryable: false };
  if (!consumeAiRateLimit(args.userId)) return { ok: false, code: "rate_limited", retryable: true };
  try {
    const lines = await args.readAggregateLines();
    const text = (await args.generate({ data: args.data, lines })).trim();
    return text
      ? { ok: true, text }
      : { ok: false, code: "empty", retryable: true };
  } catch (error) {
    return classifyAiError(error);
  }
}