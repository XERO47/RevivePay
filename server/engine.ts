import { randomUUID } from "node:crypto";
import {
  addAudit,
  closeCaseAsRecovered,
  createAction,
  db,
  getActions,
  getCase,
  getPolicy,
  registerEvent,
  updateAction,
  updateCase,
} from "./db.js";
import { createPaymentLink } from "./razorpay.js";
import type { ReplyClassification } from "./types.js";

export async function approveAndExecuteAction(caseId: string, actionId: string) {
  const recoveryCase = getCase(caseId);
  const action = getActions(caseId).find((candidate) => candidate.id === actionId);
  if (!recoveryCase || !action) throw new Error("Recovery case or action was not found.");
  if (action.status !== "proposed") throw new Error(`Action is already ${action.status}.`);
  if (["recovered", "escalated", "opted_out"].includes(recoveryCase.status)) {
    throw new Error(`No money action is allowed while the case is ${recoveryCase.status}.`);
  }

  updateAction(action.id, { status: "approved" });
  addAudit(caseId, "approval", "Human approval granted", `${action.type.replaceAll("_", " ")} was approved from the merchant dashboard.`);

  if (["payment_link", "payment_method_update", "gentle_reminder"].includes(action.type)) {
    const link = await createPaymentLink(recoveryCase);
    updateCase(caseId, { paymentUrl: link.url, status: "awaiting_payment", contactAttempts: recoveryCase.contactAttempts + 1 });
    updateAction(action.id, { status: "executed", executedAt: new Date().toISOString(), externalId: link.id });
    addAudit(caseId, "execution", "Recovery action executed", `Secure payment link created through the ${link.mode.replaceAll("_", " ")}.`);
    addAudit(caseId, "agent_message", "Recovery message sent", action.content, {
      channel: action.channel,
      actionId: action.id,
      paymentUrl: link.url,
    });
    return { link };
  }

  updateCase(caseId, { status: "action_scheduled" });
  updateAction(action.id, { status: "executed", executedAt: new Date().toISOString() });
  addAudit(caseId, "execution", "Recovery action scheduled", "The retry was scheduled within the merchant's policy window.");
  return { link: null };
}

export function handleReply(caseId: string, reply: string, classification: ReplyClassification) {
  const recoveryCase = getCase(caseId);
  if (!recoveryCase) throw new Error("Recovery case was not found.");

  addAudit(caseId, "customer", "Customer reply received", reply, {
    intent: classification.intent,
    confidence: classification.confidence,
    classifier: classification.modelSource,
  });

  const policy = getPolicy();
  if (classification.intent === "dispute" || classification.intent === "financial_hardship") {
    updateCase(caseId, { status: "escalated" });
    db.prepare("UPDATE recovery_actions SET status = 'cancelled' WHERE case_id = ? AND status IN ('proposed', 'approved')").run(caseId);
    addAudit(caseId, "guardrail", "Automation paused", classification.intent === "dispute"
      ? "A dispute was detected. All automated recovery stopped and the case was escalated."
      : "Financial hardship was detected. Automated contact stopped for human support.");
  } else if (classification.intent === "opt_out") {
    updateCase(caseId, { status: "opted_out" });
    db.prepare("UPDATE recovery_actions SET status = 'cancelled' WHERE case_id = ? AND status IN ('proposed', 'approved')").run(caseId);
    addAudit(caseId, "guardrail", "Opt-out enforced", "Customer contact was stopped immediately.");
  } else if (classification.intent === "promise_to_pay") {
    const promiseDate = classification.promisedDate ?? new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    updateCase(caseId, { status: "promise_to_pay", promiseDate });
    createAction({
      caseId,
      type: "promise_followup",
      status: "proposed",
      channel: "system",
      content: `Follow up only after the customer's promised date: ${promiseDate}.`,
      reason: "The customer explicitly committed to a payment date.",
      policyDecision: `No contact before ${promiseDate}; max ${policy.maxContactAttempts} total attempts.`,
      requiresApproval: 0,
    });
    addAudit(caseId, "decision", "Promise-to-pay recorded", `Follow-ups are suppressed until ${promiseDate}.`);
  } else {
    addAudit(caseId, "decision", "Reply held for review", "No irreversible action was taken because the message did not contain a high-confidence commitment.");
  }
  return getCase(caseId);
}

export function processIncomingEvent(eventId: string, eventType: string, caseId: string | null, payload: unknown) {
  const accepted = registerEvent(eventId, eventType, caseId, payload);
  if (!accepted) {
    addAudit(caseId, "guardrail", "Duplicate webhook ignored", `Event ${eventId} was already processed. No action was repeated.`);
    return { duplicate: true };
  }

  addAudit(caseId, "webhook", "Webhook verified", `${eventType} was accepted with event id ${eventId}.`);
  if (caseId && ["payment_link.paid", "order.paid", "payment.captured", "subscription.charged"].includes(eventType)) {
    closeCaseAsRecovered(caseId, "verified Razorpay webhook");
  }
  return { duplicate: false };
}

export function runDuplicateWebhookDemo(caseId: string) {
  const eventId = `demo_duplicate_${randomUUID().slice(0, 8)}`;
  const first = processIncomingEvent(eventId, "payment_link.paid", caseId, { demo: true, attempt: 1 });
  const second = processIncomingEvent(eventId, "payment_link.paid", caseId, { demo: true, attempt: 2 });
  return { eventId, first, second };
}
