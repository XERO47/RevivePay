import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Policy, RecoveryAction, RecoveryCase } from "./types.js";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/revivepay.db");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS recovery_cases (
    id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    failure_code TEXT NOT NULL,
    failure_message TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    recoverability REAL NOT NULL,
    recommended_action TEXT NOT NULL,
    recommendation_reason TEXT NOT NULL,
    contact_attempts INTEGER NOT NULL DEFAULT 0,
    promise_date TEXT,
    payment_url TEXT,
    baseline_recovered INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    recovered_at TEXT
  );

  CREATE TABLE IF NOT EXISTS recovery_actions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    channel TEXT NOT NULL,
    content TEXT NOT NULL,
    reason TEXT NOT NULL,
    policy_decision TEXT NOT NULL,
    requires_approval INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    executed_at TEXT,
    external_id TEXT,
    FOREIGN KEY(case_id) REFERENCES recovery_cases(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    case_id TEXT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(case_id) REFERENCES recovery_cases(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS incoming_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    case_id TEXT,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_contact_attempts INTEGER NOT NULL,
    min_gap_hours INTEGER NOT NULL,
    approval_threshold INTEGER NOT NULL,
    business_hour_start INTEGER NOT NULL,
    business_hour_end INTEGER NOT NULL,
    pause_on_dispute INTEGER NOT NULL,
    allow_discounts INTEGER NOT NULL
  );
`);

db.prepare(`
  INSERT OR IGNORE INTO policies
  (id, max_contact_attempts, min_gap_hours, approval_threshold, business_hour_start, business_hour_end, pause_on_dispute, allow_discounts)
  VALUES (1, 3, 24, 2500000, 9, 20, 1, 0)
`).run();

function isoDaysAgo(days: number, hours = 0) {
  const date = new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
  return date.toISOString();
}

const names = [
  "Aarav Mehta", "Diya Sharma", "Kabir Nair", "Ananya Iyer", "Rohan Gupta",
  "Meera Kapoor", "Vihaan Shah", "Ishita Rao", "Arjun Malhotra", "Sara Khan",
  "Neel Joshi", "Kavya Menon", "Aditya Bose", "Riya Desai", "Dev Verma",
];

const scenarios = [
  {
    type: "subscription",
    failureCode: "CARD_EXPIRED",
    failureMessage: "The saved card has expired.",
    diagnosis: "Saved payment method expired",
    action: "payment_method_update",
    reason: "A retry cannot succeed until the customer updates their payment method.",
    score: 86,
  },
  {
    type: "payment",
    failureCode: "BANK_TEMPORARILY_UNAVAILABLE",
    failureMessage: "The customer's bank was temporarily unavailable.",
    diagnosis: "Transient issuer outage",
    action: "smart_retry",
    reason: "This failure is transient; a delayed retry avoids unnecessary customer contact.",
    score: 78,
  },
  {
    type: "invoice",
    failureCode: "INVOICE_OVERDUE",
    failureMessage: "Invoice is seven days past its due date.",
    diagnosis: "Overdue receivable with no dispute",
    action: "gentle_reminder",
    reason: "The invoice is valid and no previous reminder was sent.",
    score: 72,
  },
  {
    type: "payment",
    failureCode: "INSUFFICIENT_FUNDS",
    failureMessage: "Payment declined due to insufficient funds.",
    diagnosis: "Customer balance unavailable at attempt time",
    action: "payment_link",
    reason: "An alternate payment link lets the customer choose a different method.",
    score: 64,
  },
] as const;

export function resetAndSeedDatabase() {
  db.exec("DELETE FROM incoming_events; DELETE FROM audit_logs; DELETE FROM recovery_actions; DELETE FROM recovery_cases;");
  const insertCase = db.prepare(`
    INSERT INTO recovery_cases (
      id, external_id, type, status, customer_name, customer_email, customer_phone,
      amount, currency, failure_code, failure_message, diagnosis, recoverability,
      recommended_action, recommendation_reason, contact_attempts, promise_date,
      payment_url, baseline_recovered, source, created_at, updated_at, recovered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAction = db.prepare(`
    INSERT INTO recovery_actions (
      id, case_id, type, status, channel, content, reason, policy_decision,
      requires_approval, created_at, executed_at, external_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let index = 0; index < 80; index += 1) {
    const scenario = scenarios[index % scenarios.length];
    const name = names[index % names.length];
    const amount = 149900 + ((index * 137900) % 4_850_000);
    const createdAt = isoDaysAgo(12 - (index % 12), index % 6);
    const recovered = index % 5 === 0 || index % 9 === 0;
    const promise = !recovered && index % 11 === 0;
    const escalated = !recovered && !promise && index % 13 === 0;
    const needsApproval = amount >= 2_500_000;
    const status = recovered
      ? "recovered"
      : promise
        ? "promise_to_pay"
        : escalated
          ? "escalated"
          : needsApproval
            ? "needs_review"
            : "awaiting_payment";
    const id = `rcv_${String(index + 1).padStart(4, "0")}`;
    const actionId = `act_${String(index + 1).padStart(4, "0")}`;
    const updatedAt = recovered ? isoDaysAgo(Math.max(0, 10 - (index % 10))) : createdAt;
    const paymentUrl = recovered || needsApproval ? null : `/pay/${id}`;
    const actionStatus = recovered ? "cancelled" : needsApproval ? "proposed" : "executed";
    const firstName = name.split(" ")[0];

    insertCase.run(
      id,
      `${scenario.type.slice(0, 3)}_test_${1000 + index}`,
      scenario.type,
      status,
      name,
      `${name.toLowerCase().replace(" ", ".")}@example.in`,
      `+9198${String(10000000 + index * 7919).slice(-8)}`,
      amount,
      scenario.failureCode,
      scenario.failureMessage,
      scenario.diagnosis,
      Math.max(38, scenario.score - (index % 9)),
      scenario.action,
      scenario.reason,
      recovered ? 1 : index % 3,
      promise ? new Date(Date.now() + 2 * 86_400_000).toISOString() : null,
      paymentUrl,
      index % 8 === 0 ? 1 : 0,
      "synthetic_evaluation",
      createdAt,
      updatedAt,
      recovered ? updatedAt : null,
    );

    const content = scenario.action === "smart_retry"
      ? `Retry scheduled after the issuer recovery window for ${firstName}.`
      : `Hi ${firstName}, we could not complete your payment. Use the secure link when convenient; we will stop reminders as soon as it is paid.`;
    insertAction.run(
      actionId,
      id,
      scenario.action,
      actionStatus,
      scenario.action === "smart_retry" ? "system" : "whatsapp",
      content,
      scenario.reason,
      needsApproval
        ? "Blocked by ₹25,000 human-approval threshold."
        : "Within contact, timing, and amount guardrails.",
      needsApproval ? 1 : 0,
      createdAt,
      actionStatus === "executed" ? createdAt : null,
      null,
    );
  }

  addAudit(null, "system", "Evaluation dataset loaded", "80 held-out synthetic recovery cases are ready. Results are labelled as simulated evidence.");
}

const count = db.prepare("SELECT COUNT(*) AS count FROM recovery_cases").get() as { count: number };
if (count.count === 0) resetAndSeedDatabase();

function mapCase(row: Record<string, unknown>): RecoveryCase {
  return {
    id: row.id as string,
    externalId: row.external_id as string,
    type: row.type as RecoveryCase["type"],
    status: row.status as RecoveryCase["status"],
    customerName: row.customer_name as string,
    customerEmail: row.customer_email as string,
    customerPhone: row.customer_phone as string,
    amount: row.amount as number,
    currency: row.currency as string,
    failureCode: row.failure_code as string,
    failureMessage: row.failure_message as string,
    diagnosis: row.diagnosis as string,
    recoverability: row.recoverability as number,
    recommendedAction: row.recommended_action as RecoveryCase["recommendedAction"],
    recommendationReason: row.recommendation_reason as string,
    contactAttempts: row.contact_attempts as number,
    promiseDate: row.promise_date as string | null,
    paymentUrl: row.payment_url as string | null,
    baselineRecovered: row.baseline_recovered as number,
    source: row.source as RecoveryCase["source"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    recoveredAt: row.recovered_at as string | null,
  };
}

function mapAction(row: Record<string, unknown>): RecoveryAction {
  return {
    id: row.id as string,
    caseId: row.case_id as string,
    type: row.type as RecoveryAction["type"],
    status: row.status as RecoveryAction["status"],
    channel: row.channel as RecoveryAction["channel"],
    content: row.content as string,
    reason: row.reason as string,
    policyDecision: row.policy_decision as string,
    requiresApproval: row.requires_approval as number,
    createdAt: row.created_at as string,
    executedAt: row.executed_at as string | null,
    externalId: row.external_id as string | null,
  };
}

export function getCases(): RecoveryCase[] {
  return (db.prepare(`
    SELECT * FROM recovery_cases
    ORDER BY CASE status WHEN 'needs_review' THEN 0 WHEN 'promise_to_pay' THEN 1 WHEN 'awaiting_payment' THEN 2 ELSE 3 END,
    amount DESC
  `).all() as Record<string, unknown>[]).map(mapCase);
}

export function getCase(id: string): RecoveryCase | null {
  const row = db.prepare("SELECT * FROM recovery_cases WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapCase(row) : null;
}

export function getActions(caseId: string): RecoveryAction[] {
  return (db.prepare("SELECT * FROM recovery_actions WHERE case_id = ? ORDER BY created_at DESC").all(caseId) as Record<string, unknown>[]).map(mapAction);
}

export function getAudit(caseId?: string) {
  const rows = caseId
    ? db.prepare("SELECT * FROM audit_logs WHERE case_id = ? ORDER BY created_at DESC LIMIT 50").all(caseId)
    : db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 60").all();
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    caseId: row.case_id,
    category: row.category,
    title: row.title,
    detail: row.detail,
    metadata: JSON.parse(row.metadata as string),
    createdAt: row.created_at,
  }));
}

export function addAudit(caseId: string | null, category: string, title: string, detail: string, metadata: object = {}) {
  db.prepare(`INSERT INTO audit_logs (id, case_id, category, title, detail, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), caseId, category, title, detail, JSON.stringify(metadata), new Date().toISOString());
}

export function getPolicy(): Policy {
  const row = db.prepare("SELECT * FROM policies WHERE id = 1").get() as Record<string, unknown>;
  return {
    maxContactAttempts: row.max_contact_attempts as number,
    minGapHours: row.min_gap_hours as number,
    approvalThreshold: row.approval_threshold as number,
    businessHourStart: row.business_hour_start as number,
    businessHourEnd: row.business_hour_end as number,
    pauseOnDispute: Boolean(row.pause_on_dispute),
    allowDiscounts: Boolean(row.allow_discounts),
  };
}

export function updatePolicy(policy: Policy) {
  db.prepare(`
    UPDATE policies SET max_contact_attempts = ?, min_gap_hours = ?, approval_threshold = ?,
      business_hour_start = ?, business_hour_end = ?, pause_on_dispute = ?, allow_discounts = ? WHERE id = 1
  `).run(
    policy.maxContactAttempts,
    policy.minGapHours,
    policy.approvalThreshold,
    policy.businessHourStart,
    policy.businessHourEnd,
    policy.pauseOnDispute ? 1 : 0,
    policy.allowDiscounts ? 1 : 0,
  );
}

export function updateCase(id: string, values: Record<string, string | number | null>) {
  const allowed: Record<string, string> = {
    status: "status",
    promiseDate: "promise_date",
    paymentUrl: "payment_url",
    contactAttempts: "contact_attempts",
    recoveredAt: "recovered_at",
  };
  const entries = Object.entries(values).filter(([key]) => allowed[key]);
  if (!entries.length) return;
  const clauses = entries.map(([key]) => `${allowed[key]} = ?`);
  const params = entries.map(([, value]) => value);
  clauses.push("updated_at = ?");
  params.push(new Date().toISOString());
  db.prepare(`UPDATE recovery_cases SET ${clauses.join(", ")} WHERE id = ?`).run(...params, id);
}

export function updateAction(id: string, values: { status: string; executedAt?: string; externalId?: string }) {
  db.prepare("UPDATE recovery_actions SET status = ?, executed_at = COALESCE(?, executed_at), external_id = COALESCE(?, external_id) WHERE id = ?")
    .run(values.status, values.executedAt ?? null, values.externalId ?? null, id);
}

export function createAction(action: Omit<RecoveryAction, "id" | "createdAt" | "executedAt" | "externalId">) {
  const id = `act_${randomUUID().slice(0, 10)}`;
  db.prepare(`
    INSERT INTO recovery_actions (id, case_id, type, status, channel, content, reason, policy_decision, requires_approval, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, action.caseId, action.type, action.status, action.channel, action.content, action.reason, action.policyDecision, action.requiresApproval, new Date().toISOString());
  return id;
}

export function closeCaseAsRecovered(id: string, source: string) {
  const now = new Date().toISOString();
  updateCase(id, { status: "recovered", recoveredAt: now });
  db.prepare("UPDATE recovery_actions SET status = 'cancelled' WHERE case_id = ? AND status IN ('proposed', 'approved')").run(id);
  addAudit(id, "money", "Payment verified — recovery stopped", `Payment confirmation received from ${source}. Every pending reminder was cancelled.`);
}

export function registerEvent(eventId: string, eventType: string, caseId: string | null, payload: unknown): boolean {
  try {
    db.prepare("INSERT INTO incoming_events (event_id, event_type, case_id, payload, received_at) VALUES (?, ?, ?, ?, ?)")
      .run(eventId, eventType, caseId, JSON.stringify(payload), new Date().toISOString());
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) return false;
    throw error;
  }
}
