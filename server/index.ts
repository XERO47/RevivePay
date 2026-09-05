import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { classifyReply } from "./ai.js";
import {
  addAudit,
  closeCaseAsRecovered,
  getActions,
  getAudit,
  getCase,
  getCases,
  getPolicy,
  resetAndSeedDatabase,
  updatePolicy,
} from "./db.js";
import { approveAndExecuteAction, handleReply, processIncomingEvent, runDuplicateWebhookDemo } from "./engine.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

function safeSignature(raw: Buffer, actual: string, secret: string) {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

app.post("/api/webhooks/razorpay", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "RAZORPAY_WEBHOOK_SECRET is not configured." });
  const signature = String(req.header("x-razorpay-signature") ?? "");
  const raw = req.body as Buffer;
  if (!safeSignature(raw, signature, secret)) return res.status(401).json({ error: "Invalid webhook signature." });

  try {
    const payload = JSON.parse(raw.toString("utf8")) as Record<string, any>;
    const eventId = String(req.header("x-razorpay-event-id") ?? "");
    if (!eventId) return res.status(400).json({ error: "Missing x-razorpay-event-id." });
    const eventType = String(payload.event ?? "unknown");
    const caseId = payload.payload?.payment_link?.entity?.reference_id
      ?? payload.payload?.payment?.entity?.notes?.revive_case_id
      ?? payload.payload?.subscription?.entity?.notes?.revive_case_id
      ?? null;
    return res.status(200).json(processIncomingEvent(eventId, eventType, caseId, payload));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid webhook payload." });
  }
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "revivepay", timestamp: new Date().toISOString() });
});

app.get("/api/dashboard", (_req, res) => {
  const cases = getCases();
  const recovered = cases.filter((item) => item.status === "recovered");
  const active = cases.filter((item) => !["recovered", "escalated", "opted_out"].includes(item.status));
  const totalValue = cases.reduce((sum, item) => sum + item.amount, 0);
  const recoveredValue = recovered.reduce((sum, item) => sum + item.amount, 0);
  const baselineValue = cases.filter((item) => item.baselineRecovered).reduce((sum, item) => sum + item.amount, 0);
  const approvalCount = cases.filter((item) => item.status === "needs_review").length;
  const recoveredByDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000);
    const day = date.toISOString().slice(0, 10);
    const value = recovered
      .filter((item) => item.recoveredAt?.slice(0, 10) === day)
      .reduce((sum, item) => sum + item.amount, 0);
    return { day, value };
  });
  res.json({
    metrics: {
      totalCases: cases.length,
      totalValue,
      activeValue: active.reduce((sum, item) => sum + item.amount, 0),
      recoveredValue,
      recoveryRate: totalValue ? (recoveredValue / totalValue) * 100 : 0,
      recoveredCases: recovered.length,
      approvalCount,
      guardrailViolations: 0,
      baselineValue,
      uplift: baselineValue ? ((recoveredValue - baselineValue) / baselineValue) * 100 : 0,
    },
    recoveredByDay,
    cases,
    audit: getAudit(),
    integration: {
      razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      replyProvider: process.env.OPENROUTER_API_KEY ? "OpenRouter" : process.env.OPENAI_API_KEY ? "OpenAI" : "Safe fallback",
      replyModel: process.env.OPENROUTER_API_KEY ? (process.env.OPENROUTER_MODEL ?? "openrouter/free") : process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL ?? "gpt-5-mini") : "deterministic rules",
      mode: process.env.RAZORPAY_KEY_ID ? "Razorpay test mode" : "Safe demo adapter",
    },
  });
});

app.get("/api/cases/:id", (req, res) => {
  const recoveryCase = getCase(req.params.id);
  if (!recoveryCase) return res.status(404).json({ error: "Case not found." });
  return res.json({ case: recoveryCase, actions: getActions(recoveryCase.id), audit: getAudit(recoveryCase.id) });
});

app.post("/api/cases/:id/actions/:actionId/approve", async (req, res) => {
  try {
    const result = await approveAndExecuteAction(req.params.id, req.params.actionId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : "Action could not be executed." });
  }
});

const replyBody = z.object({ text: z.string().trim().min(2).max(1_000) });
app.post("/api/cases/:id/reply", async (req, res) => {
  try {
    const { text } = replyBody.parse(req.body);
    const classification = await classifyReply(text);
    const updatedCase = handleReply(req.params.id, text, classification);
    return res.json({ classification, case: updatedCase });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Reply could not be processed." });
  }
});

app.post("/api/cases/:id/demo-pay", (req, res) => {
  const recoveryCase = getCase(req.params.id);
  if (!recoveryCase) return res.status(404).json({ error: "Case not found." });
  if (recoveryCase.status === "recovered") return res.status(200).json({ ok: true, alreadyRecovered: true });
  closeCaseAsRecovered(recoveryCase.id, "demo checkout with test-mode semantics");
  return res.json({ ok: true });
});

app.post("/api/demo/duplicate-webhook/:id", (req, res) => {
  const recoveryCase = getCase(req.params.id);
  if (!recoveryCase) return res.status(404).json({ error: "Case not found." });
  return res.json(runDuplicateWebhookDemo(recoveryCase.id));
});

app.post("/api/demo/reset", (_req, res) => {
  resetAndSeedDatabase();
  res.json({ ok: true });
});

app.get("/api/policies", (_req, res) => res.json(getPolicy()));

const policyBody = z.object({
  maxContactAttempts: z.number().int().min(1).max(10),
  minGapHours: z.number().int().min(1).max(168),
  approvalThreshold: z.number().int().min(100),
  businessHourStart: z.number().int().min(0).max(23),
  businessHourEnd: z.number().int().min(1).max(24),
  pauseOnDispute: z.boolean(),
  allowDiscounts: z.boolean(),
});

app.put("/api/policies", (req, res) => {
  try {
    const policy = policyBody.parse(req.body);
    updatePolicy(policy);
    addAudit(null, "policy", "Merchant policy updated", "Recovery actions will use the new contact and approval limits.");
    return res.json(policy);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid policy." });
  }
});

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = resolve(currentDirectory, "../client");
app.use(express.static(clientDirectory));
app.get("*path", (_req, res) => res.sendFile(resolve(clientDirectory, "index.html")));

app.listen(port, "0.0.0.0", () => {
  console.log(`RevivePay listening on http://0.0.0.0:${port}`);
});
