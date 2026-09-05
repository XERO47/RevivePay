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

const classificationInstructions = [
  "Classify a customer's reply to a merchant's payment-recovery message.",
  "promise_to_pay means an explicit commitment to pay now or in the future, such as 'I will pay Monday'.",
  "payment_question is only a question about amount, link, invoice, UPI, card, or how to pay; it is not a commitment.",
  "dispute means the customer denies the transaction, ownership, amount, delivery, or validity.",
  "financial_hardship means inability to pay because of financial distress.",
  "opt_out means the customer asks for contact to stop.",
  "Never infer a promise unless the customer clearly commits to payment.",
  "Treat disputes, hardship, and opt-outs conservatively because they stop automation.",
  "Use an ISO YYYY-MM-DD promisedDate only for promise_to_pay when a date can be resolved; otherwise null.",
  "Return JSON only with exactly intent, promisedDate, confidence, and summary.",
  "intent must be one of promise_to_pay, dispute, financial_hardship, opt_out, payment_question, general.",
  "confidence must be a number from 0 to 1, not a word.",
].join(" ");

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

function parseJsonContent(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model response did not contain a JSON object.");
  const objectText = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(objectText) as Omit<ReplyClassification, "modelSource" | "modelName">;
  } catch {
    // Some free models honor the schema semantically but emit JS-style keys or trailing commas.
    const repaired = objectText
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired) as Omit<ReplyClassification, "modelSource" | "modelName">;
  }
}

function normalizeModelClassification(raw: Record<string, unknown>, text: string) {
  const allowedIntents = ["promise_to_pay", "dispute", "financial_hardship", "opt_out", "payment_question", "general"] as const;
  const fallback = fallbackClassify(text);
  const rawIntent = typeof raw.intent === "string" ? raw.intent : "";
  let intent = allowedIntents.includes(rawIntent as typeof allowedIntents[number])
    ? rawIntent as typeof allowedIntents[number]
    : fallback.intent;

  // Safety-critical local checks can only make the workflow more conservative.
  if (["dispute", "financial_hardship", "opt_out"].includes(fallback.intent)) intent = fallback.intent;
  if (/\b(i\s*(?:will|'ll)|we\s*(?:will|'ll)|going to)\s+pay\b/i.test(text)) intent = "promise_to_pay";

  const rawConfidence = typeof raw.confidence === "number"
    ? raw.confidence
    : typeof raw.confidence === "string" && /^\d+(?:\.\d+)?$/.test(raw.confidence)
      ? Number(raw.confidence)
      : typeof raw.confidence === "string" && raw.confidence.toLowerCase() === "high"
        ? 0.9
        : 0.7;
  const promisedDate = intent === "promise_to_pay" && typeof raw.promisedDate === "string"
    ? raw.promisedDate
    : intent === "promise_to_pay"
      ? fallback.promisedDate
      : null;

  return {
    intent,
    promisedDate,
    confidence: Math.max(0, Math.min(1, rawConfidence)),
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
  };
}

async function classifyWithOpenRouter(text: string): Promise<ReplyClassification> {
  const model = process.env.OPENROUTER_MODEL ?? "liquid/lfm-2.5-2.6b:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_APP_URL ?? "http://localhost:3001",
      "X-Title": "RevivePay",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      // Free reasoning models may spend part of this budget before emitting the JSON payload.
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: classificationInstructions,
        },
        { role: "user", content: text },
      ],
      // JSON mode is more consistently honored by small free models; the result is
      // validated and normalized server-side before the policy engine sees it.
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 240)}`);
  }
  const data = await response.json() as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no classification content.");
  const parsed = normalizeModelClassification(parseJsonContent(content) as unknown as Record<string, unknown>, text);
  return { ...parsed, modelSource: "openrouter", modelName: data.model ?? model };
}

export async function classifyReply(text: string): Promise<ReplyClassification> {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await classifyWithOpenRouter(text);
    } catch (error) {
      console.warn("OpenRouter classification failed; trying the next safe provider", error instanceof Error ? error.message : error);
    }
  }

  if (!process.env.OPENAI_API_KEY) return fallbackClassify(text);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 7_000, maxRetries: 1 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      instructions: classificationInstructions,
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
    return { ...parsed, modelSource: "openai", modelName: response.model };
  } catch (error) {
    console.warn("AI reply classification failed; using deterministic fallback", error instanceof Error ? error.message : error);
    return fallbackClassify(text);
  }
}
