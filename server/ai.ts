import OpenAI from "openai";
import type { ReplyClassification } from "./types.js";

const replySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["promise_to_pay", "dispute", "financial_hardship", "opt_out", "payment_question", "general"],
    },
    promisedDate: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string" },
  },
  required: ["intent", "promisedDate", "confidence", "summary"],
} as const;

function fallbackClassify(text: string): ReplyClassification {
  const normalized = text.toLowerCase();
  const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
  const dayOffset = normalized.includes("tomorrow") ? 1 : normalized.includes("monday") ? ((8 - new Date().getDay()) % 7 || 7) : null;
  const promisedDate = isoDate ?? (dayOffset
    ? new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10)
    : null);

  if (/not mine|did not (buy|purchase)|fraud|wrong (invoice|amount)|dispute|never ordered/.test(normalized)) {
    return { intent: "dispute", promisedDate: null, confidence: 0.94, summary: "Customer disputes the underlying payment or invoice.", modelSource: "deterministic_fallback" };
  }
  if (/stop|unsubscribe|do not contact|don't contact|opt.?out/.test(normalized)) {
    return { intent: "opt_out", promisedDate: null, confidence: 0.97, summary: "Customer has asked not to be contacted.", modelSource: "deterministic_fallback" };
  }
  if (/hardship|lost my job|cannot afford|can't afford|no money/.test(normalized)) {
    return { intent: "financial_hardship", promisedDate: null, confidence: 0.9, summary: "Customer reports financial hardship and needs human support.", modelSource: "deterministic_fallback" };
  }
  if (/pay|payment/.test(normalized) && /(tomorrow|monday|friday|next week|20\d{2}-\d{2}-\d{2})/.test(normalized)) {
    return { intent: "promise_to_pay", promisedDate, confidence: 0.86, summary: "Customer committed to paying on a future date.", modelSource: "deterministic_fallback" };
  }
  if (/how|link|method|upi|card|invoice copy/.test(normalized)) {
    return { intent: "payment_question", promisedDate: null, confidence: 0.76, summary: "Customer has a question about completing payment.", modelSource: "deterministic_fallback" };
  }
  return { intent: "general", promisedDate: null, confidence: 0.6, summary: "No high-confidence recovery intent detected.", modelSource: "deterministic_fallback" };
}

export async function classifyReply(text: string): Promise<ReplyClassification> {
  if (!process.env.OPENAI_API_KEY) return fallbackClassify(text);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 7_000, maxRetries: 1 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      instructions: [
        "Classify a customer's reply to a merchant's payment-recovery message.",
        "Never infer a promise-to-pay unless the customer clearly commits to payment.",
        "Treat disputes, hardship, and opt-outs conservatively because they stop automation.",
        "Use an ISO YYYY-MM-DD promisedDate only when a date can be resolved; otherwise null.",
      ].join(" "),
      input: text,
      text: {
        format: {
          type: "json_schema",
          name: "recovery_reply",
          strict: true,
          schema: replySchema,
        },
      },
    });
    const parsed = JSON.parse(response.output_text) as Omit<ReplyClassification, "modelSource">;
    return { ...parsed, modelSource: "openai" };
  } catch (error) {
    console.warn("AI reply classification failed; using deterministic fallback", error instanceof Error ? error.message : error);
    return fallbackClassify(text);
  }
}
