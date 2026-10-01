import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../env.js";

export interface KycStartResult { providerRef: string; url: string | null; autoApproved?: boolean }
export interface KycWebhookResult { providerRef: string; status: "approved" | "rejected" | "review" | "pending"; data: Record<string, unknown> }
export interface KycProvider {
  name: string;
  start(input: { userId: string; email: string; tier: number; callbackUrl: string; redirectUrl: string }): Promise<KycStartResult>;
  /** Parse + verify a webhook. Throw to reject. */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<KycWebhookResult>;
}

/** Dev: approves immediately when KYC_AUTO_APPROVE, otherwise stays pending until an admin approves. */
export class MockKycProvider implements KycProvider {
  name = "mock";
  async start(input: { userId: string; tier: number }): Promise<KycStartResult> {
    return { providerRef: `mock_${input.userId}_${Date.now()}`, url: null, autoApproved: env.KYC_AUTO_APPROVE };
  }
  async parseWebhook(rawBody: string): Promise<KycWebhookResult> {
    const j = JSON.parse(rawBody); return { providerRef: j.providerRef, status: j.status, data: j };
  }
}

/**
 * Didit (https://didit.me) — hosted verification session + HMAC-signed webhooks. Low-cost tier makes it
 * the recommended launch IDV in docs/compliance.md. Endpoints/field names below follow Didit's public
 * API at time of writing; re-verify against current docs before go-live.
 */
export class DiditKycProvider implements KycProvider {
  name = "didit";
  private apiKey = process.env.DIDIT_API_KEY ?? "";
  private workflowId = process.env.DIDIT_WORKFLOW_ID ?? "";
  private webhookSecret = process.env.DIDIT_WEBHOOK_SECRET ?? "";
  async start(input: { userId: string; tier: number; callbackUrl: string; redirectUrl: string }): Promise<KycStartResult> {
    if (!this.apiKey || !this.workflowId) throw new Error("DIDIT_API_KEY / DIDIT_WORKFLOW_ID not configured");
    const r = await fetch("https://verification.didit.me/v2/session/", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ workflow_id: this.workflowId, vendor_data: input.userId, callback: input.redirectUrl }),
    });
    if (!r.ok) throw new Error(`didit session failed: ${r.status} ${await r.text()}`);
    const j: any = await r.json();
    return { providerRef: j.session_id, url: j.url };
  }
  async parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<KycWebhookResult> {
    const sig = String(headers["x-signature"] ?? "");
    const ts = String(headers["x-timestamp"] ?? "");
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("bad didit signature");
    if (ts && Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new Error("stale didit webhook");
    const j: any = JSON.parse(rawBody);
    const map: Record<string, KycWebhookResult["status"]> = { Approved: "approved", Declined: "rejected", "In Review": "review", "Not Started": "pending", "In Progress": "pending", Abandoned: "pending" };
    return { providerRef: j.session_id, status: map[j.status] ?? "pending", data: j };
  }
}

export function makeKycProvider(): KycProvider {
  switch (env.KYC_PROVIDER) {
    case "didit": return new DiditKycProvider();
    case "mock": if (env.isProd && !env.ALLOW_MOCK_PROVIDERS) throw new Error("KYC_PROVIDER=mock is not allowed in production (set ALLOW_MOCK_PROVIDERS=true for play-money test mode)"); return new MockKycProvider();
    default: throw new Error(`unknown KYC_PROVIDER ${env.KYC_PROVIDER}`);
  }
}
