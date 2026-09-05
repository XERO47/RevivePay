export type CaseType = "payment" | "subscription" | "invoice";
export type CaseStatus =
  | "needs_review"
  | "action_scheduled"
  | "awaiting_payment"
  | "promise_to_pay"
  | "recovered"
  | "escalated"
  | "opted_out";

export type ActionType =
  | "smart_retry"
  | "payment_link"
  | "payment_method_update"
  | "gentle_reminder"
  | "promise_followup"
  | "human_review";

export interface RecoveryCase {
  id: string;
  externalId: string;
  type: CaseType;
  status: CaseStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amount: number;
  currency: string;
  failureCode: string;
  failureMessage: string;
  diagnosis: string;
  recoverability: number;
  recommendedAction: ActionType;
  recommendationReason: string;
  contactAttempts: number;
  promiseDate: string | null;
  paymentUrl: string | null;
  baselineRecovered: number;
  source: "razorpay_test" | "synthetic_evaluation";
  createdAt: string;
  updatedAt: string;
  recoveredAt: string | null;
}

export interface RecoveryAction {
  id: string;
  caseId: string;
  type: ActionType;
  status: "proposed" | "approved" | "executed" | "blocked" | "cancelled";
  channel: "system" | "email" | "whatsapp" | "dashboard";
  content: string;
  reason: string;
  policyDecision: string;
  requiresApproval: number;
  createdAt: string;
  executedAt: string | null;
  externalId: string | null;
}

export interface Policy {
  maxContactAttempts: number;
  minGapHours: number;
  approvalThreshold: number;
  businessHourStart: number;
  businessHourEnd: number;
  pauseOnDispute: boolean;
  allowDiscounts: boolean;
}

export interface ReplyClassification {
  intent:
    | "promise_to_pay"
    | "dispute"
    | "financial_hardship"
    | "opt_out"
    | "payment_question"
    | "general";
  promisedDate: string | null;
  confidence: number;
  summary: string;
  modelSource: "openrouter" | "openai" | "deterministic_fallback";
  modelName?: string;
}
