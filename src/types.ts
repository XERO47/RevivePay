export interface RecoveryCase {
  id: string;
  externalId: string;
  type: "payment" | "subscription" | "invoice";
  status: "needs_review" | "action_scheduled" | "awaiting_payment" | "promise_to_pay" | "recovered" | "escalated" | "opted_out";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amount: number;
  currency: string;
  failureCode: string;
  failureMessage: string;
  diagnosis: string;
  recoverability: number;
  recommendedAction: string;
  recommendationReason: string;
  contactAttempts: number;
  promiseDate: string | null;
  paymentUrl: string | null;
  baselineRecovered: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  recoveredAt: string | null;
}

export interface RecoveryAction {
  id: string;
  caseId: string;
  type: string;
  status: string;
  channel: string;
  content: string;
  reason: string;
  policyDecision: string;
  requiresApproval: number;
  createdAt: string;
  executedAt: string | null;
  externalId: string | null;
}

export interface AuditItem {
  id: string;
  caseId: string | null;
  category: string;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardData {
  metrics: {
    totalCases: number;
    totalValue: number;
    activeValue: number;
    recoveredValue: number;
    recoveryRate: number;
    recoveredCases: number;
    approvalCount: number;
    guardrailViolations: number;
    baselineValue: number;
    uplift: number;
  };
  recoveredByDay: { day: string; value: number }[];
  cases: RecoveryCase[];
  audit: AuditItem[];
  integration: {
    razorpay: boolean;
    openrouter: boolean;
    openai: boolean;
    replyProvider: string;
    replyModel: string;
    mode: string;
  };
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
