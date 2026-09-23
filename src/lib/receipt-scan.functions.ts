/**
 * Receipt extraction server function.
 *
 * Authenticated, rate limited, strictly scoped: the image is used once to
 * extract merchant, date, total, tax, currency and a suggested category, and is
 * never stored, logged or forwarded anywhere else.
 */
import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ScanReceiptInput, runReceiptScan, type ScanReceiptResult } from "@/lib/receipt-core";

export function receiptSystemPrompt(categories: string[], fallbackCurrency: string): string {
  return [
    "You extract structured data from a photo of a purchase receipt for a personal finance app.",
    "Return ONLY a JSON object with exactly these keys: merchant, date, total, tax, currency, category.",
    "merchant: store name as printed, or null. date: ISO YYYY-MM-DD of the purchase, or null.",
    "total: the final amount paid as a positive number. tax: the tax/VAT amount if printed, else null.",
    `currency: ISO 4217 code visible on the receipt, else "${fallbackCurrency}".`,
    `category: the single best match from this list: ${categories.join(", ")}.`,
    "Never invent values that are not visible. Use null when unsure. Output no prose, no code fences.",
  ].join("\n");
}

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ScanReceiptInput.parse(data))
  .handler(async ({ data, context }): Promise<ScanReceiptResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, code: "configuration", retryable: false };

    return runReceiptScan({
      userId: context.userId,
      data,
      extract: async ({ data: request }) => {
        const runIdFetch = createLovableAiGatewayRunIdFetch();
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: key,
          headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        const result = streamText({
          model: lovable.responses("openai/gpt-6-astra"),
          system: receiptSystemPrompt(request.categories, request.currency),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the receipt fields as JSON." },
                { type: "image", image: request.imageDataUrl, mediaType: request.mimeType },
              ],
            },
          ],
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });
        return result.text;
      },
    }).then((result) => {
      if (!result.ok) console.error("[NOVA receipt] Extraction failed", result.code);
      return result;
    });
  });
