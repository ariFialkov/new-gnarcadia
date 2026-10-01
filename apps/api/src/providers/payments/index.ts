import { env } from "../../env.js";
import type { Currency } from "@gnarcadia/protocol";

/**
 * Payment provider adapter. See docs/payments.md for the vendor strategy
 * (Nuvei/Paysafe cards + Interac via Paramount/Payper in Canada, Aeropay pay-by-bank in the US).
 * The platform never touches card data: every provider uses a hosted page / hosted fields (PCI SAQ-A).
 */
export type DepositMethod = "card" | "interac" | "bank" | "wallet";
export type PayoutMethod = "interac" | "bank" | "card_push" | "wallet";

export interface CreateDepositInput { intentId: string; userId: string; email: string; amountCents: number; currency: Currency; method: DepositMethod; country: "CA" | "US"; returnUrl: string; webhookUrl: string; }
export interface CreateDepositResult { providerRef: string; redirectUrl: string | null; status: "pending" | "succeeded" | "failed"; feeCents?: number }
export interface CreatePayoutInput { intentId: string; userId: string; email: string; legalName: string | null; amountCents: number; currency: Currency; method: PayoutMethod; country: "CA" | "US"; destination: Record<string, string>; webhookUrl: string; }
export interface CreatePayoutResult { providerRef: string; status: "pending" | "succeeded" | "failed"; feeCents?: number }
export interface WebhookEvent { providerRef: string; kind: "deposit" | "payout"; status: "succeeded" | "failed" | "reversed"; amountCents?: number; raw: unknown }

export interface PaymentProvider {
  name: string;
  /** Methods this provider supports per country, used to render the cashier. */
  methods(country: "CA" | "US"): { deposit: DepositMethod[]; payout: PayoutMethod[] };
  createDeposit(input: CreateDepositInput): Promise<CreateDepositResult>;
  createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult>;
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent>;
}

/** Dev: deposits succeed instantly; payouts succeed after the webhook is simulated by /dev/payments/complete. */
export class MockPaymentProvider implements PaymentProvider {
  name = "mock";
  methods(country: "CA" | "US") {
    return country === "CA" ? { deposit: ["card", "interac"] as DepositMethod[], payout: ["interac", "bank"] as PayoutMethod[] } : { deposit: ["card", "bank"] as DepositMethod[], payout: ["bank", "card_push"] as PayoutMethod[] };
  }
  async createDeposit(input: CreateDepositInput): Promise<CreateDepositResult> {
    return { providerRef: `mock_dep_${input.intentId}`, redirectUrl: null, status: "succeeded", feeCents: Math.round(input.amountCents * 0.029) + 30 };
  }
  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    return { providerRef: `mock_po_${input.intentId}`, status: "pending", feeCents: 100 };
  }
  async parseWebhook(rawBody: string): Promise<WebhookEvent> {
    const j = JSON.parse(rawBody); return { providerRef: j.providerRef, kind: j.kind, status: j.status, raw: j };
  }
}

/**
 * Nuvei skeleton (cards, Apple/Google Pay, Interac e-Transfer in CA, ACH in US, payouts via Visa Direct/EFT).
 * Flow: server openOrder -> client Payment Page / Web SDK -> DMN webhook. Fill in once you have merchant credentials.
 * Docs: https://docs.nuvei.com (Payment Page + DMNs). Marked unimplemented so misconfiguration fails loudly.
 */
export class NuveiPaymentProvider implements PaymentProvider {
  name = "nuvei";
  methods(country: "CA" | "US") {
    return country === "CA" ? { deposit: ["card", "interac"] as DepositMethod[], payout: ["interac", "card_push", "bank"] as PayoutMethod[] } : { deposit: ["card", "bank"] as DepositMethod[], payout: ["bank", "card_push"] as PayoutMethod[] };
  }
  async createDeposit(_i: CreateDepositInput): Promise<CreateDepositResult> { throw new Error("Nuvei adapter: implement openOrder + Payment Page redirect (see docs/payments.md §adapter mapping)"); }
  async createPayout(_i: CreatePayoutInput): Promise<CreatePayoutResult> { throw new Error("Nuvei adapter: implement /payout with Visa Direct / Interac send"); }
  async parseWebhook(): Promise<WebhookEvent> { throw new Error("Nuvei adapter: verify DMN advanceResponseChecksum before trusting"); }
}

export function makePaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "nuvei": return new NuveiPaymentProvider();
    case "mock": if (env.isProd) throw new Error("PAYMENT_PROVIDER=mock is not allowed in production"); return new MockPaymentProvider();
    default: throw new Error(`unknown PAYMENT_PROVIDER ${env.PAYMENT_PROVIDER}`);
  }
}
