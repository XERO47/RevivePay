import type { RecoveryCase } from "./types.js";

export interface PaymentLinkResult {
  id: string;
  url: string;
  mode: "razorpay_test" | "demo_adapter";
}

export async function createPaymentLink(recoveryCase: RecoveryCase): Promise<PaymentLinkResult> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const publicUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3001";

  if (!keyId || !keySecret) {
    return {
      id: `plink_demo_${recoveryCase.id}`,
      url: `${publicUrl.replace(/\/$/, "")}/pay/${recoveryCase.id}`,
      mode: "demo_adapter",
    };
  }

  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: recoveryCase.amount,
      currency: recoveryCase.currency,
      accept_partial: false,
      reference_id: recoveryCase.id,
      description: `Recovery for ${recoveryCase.externalId}`,
      customer: {
        name: recoveryCase.customerName,
        email: recoveryCase.customerEmail,
        contact: recoveryCase.customerPhone,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { revive_case_id: recoveryCase.id, bounded_recovery: "true" },
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay Payment Link failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json() as { id: string; short_url: string };
  return { id: data.id, url: data.short_url, mode: "razorpay_test" };
}
