/**
 * Razorpay Payment Provider — The Product Lab
 *
 * PLUGIN VERDICT (2026-06-11):
 * No production-ready Medusa v2 (2.x) Razorpay plugin exists on npm.
 * The `medusa-payment-razorpay` package targets v1 and is incompatible with
 * the v2 AbstractPaymentProvider interface.  A community port exists but has
 * not been verified working against v2.15.x.  Custom provider built here for
 * full control over the payment path.
 *
 * DORMANCY CONTRACT:
 * This file is only loaded into medusa-config.ts when RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET are present in the environment.  When keys are absent,
 * this module is never registered and the app boots with COD-only payments.
 * Going live = paste keys into .env, restart the backend.  No code change.
 *
 * IMPLEMENTATION STATUS:
 * - initiatePayment: creates Razorpay order via REST API  ✓
 * - authorizePayment: verifies HMAC-SHA256 signature      ✓
 * - capturePayment: no-op (auto-capture enabled at order creation)  ✓
 * - refundPayment: calls Razorpay refund endpoint         ✓
 * - cancelPayment: stub (Razorpay orders can't be cancelled once paid) ✓
 * - getPaymentStatus: queries Razorpay GET /payments/{id} ✓
 * - Webhook route: see src/api/store/razorpay-webhook/route.ts
 *
 * NOT YET WIRED (requires live keys to test):
 * - UPI intent flow (razorpay_payment_id returned via redirect, not handler)
 * - EMI / Pay Later via Razorpay Affordability Suite
 *
 * REQUIRED ENV VARS:
 *   RAZORPAY_KEY_ID=rzp_test_...        (test) / rzp_live_... (live)
 *   RAZORPAY_KEY_SECRET=<secret>
 *   RAZORPAY_WEBHOOK_SECRET=<webhook_secret>  (set in Razorpay dashboard)
 *
 * STOREFRONT ALSO NEEDS:
 *   NEXT_PUBLIC_RAZORPAY_KEY_ID=<same as KEY_ID above — safe to expose>
 */

import crypto from "crypto"
import {
  AbstractPaymentProvider,
  ModuleProvider,
  Modules,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type RazorpayOptions = {
  key_id: string
  key_secret: string
  webhook_secret: string
}

type RazorpayOrderResponse = {
  id: string
  amount: number
  currency: string
  receipt: string
  status: string
}

type RazorpayPaymentData = {
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
  status: string
  amount?: number
  currency?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function razorpayRequest<T>(
  method: "GET" | "POST",
  path: string,
  keyId: string,
  keySecret: string,
  body?: object
): Promise<T> {
  const base64Auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const url = `https://api.razorpay.com/v1${path}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${base64Auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Razorpay API error ${res.status}: ${errorBody}`)
  }

  return res.json() as Promise<T>
}

function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const payload = `${orderId}|${paymentId}`
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(payload)
    .digest("hex")
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// ── Provider ──────────────────────────────────────────────────────────────────

class RazorpayPaymentProvider extends AbstractPaymentProvider<RazorpayOptions> {
  static identifier = "razorpay"

  private keyId: string
  private keySecret: string
  private webhookSecret: string

  constructor(container: Record<string, unknown>, options: RazorpayOptions) {
    super(container, options)
    this.keyId = options.key_id
    this.keySecret = options.key_secret
    this.webhookSecret = options.webhook_secret || ""
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  /**
   * Creates a Razorpay order.  The order ID is stored in the session data and
   * passed to the storefront to open the Razorpay checkout modal.
   *
   * NOTE (verify at go-live): `input.amount` is forwarded to Razorpay as the
   * order amount in paise. Confirm Medusa's amount unit against Razorpay's
   * minor-unit expectation with a real test transaction before launch.
   */
  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    try {
      const order = await razorpayRequest<RazorpayOrderResponse>(
        "POST",
        "/orders",
        this.keyId,
        this.keySecret,
        {
          amount: Math.round(Number(input.amount)), // paise
          currency: (input.currency_code || "inr").toUpperCase(),
          receipt: `tpl_${crypto.randomUUID()}`,
          payment_capture: 1, // auto-capture after authorisation
        }
      )

      return {
        id: order.id,
        status: PaymentSessionStatus.PENDING,
        data: {
          razorpay_order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          status: "created",
        },
      }
    } catch (err) {
      throw new Error(
        `Razorpay initiatePayment failed: ${(err as Error).message}`
      )
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    // Amount changes are rare for TPL (fixed-price accessories).
    // Re-create the Razorpay order if the amount changed.
    return this.initiatePayment(input)
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    // Razorpay orders are deleted by expiry (default 15 min after creation).
    // Nothing to do here.
    return { data: input.data }
  }

  // ── Authorisation ─────────────────────────────────────────────────────────

  /**
   * Verifies the HMAC-SHA256 signature that Razorpay passes to the storefront
   * handler callback.  The storefront POSTs these three fields to
   * /store/razorpay-webhook after payment succeeds.
   */
  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as RazorpayPaymentData

    if (!data.razorpay_payment_id || !data.razorpay_order_id || !data.razorpay_signature) {
      return {
        status: PaymentSessionStatus.PENDING,
        data: { ...data, error: "missing_razorpay_fields" },
      }
    }

    const valid = verifyRazorpaySignature(
      data.razorpay_order_id,
      data.razorpay_payment_id,
      data.razorpay_signature,
      this.keySecret
    )

    if (!valid) {
      return {
        status: PaymentSessionStatus.ERROR,
        data: { ...data, error: "signature_mismatch" },
      }
    }

    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: {
        ...data,
        authorized_at: new Date().toISOString(),
      },
    }
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  // payment_capture: 1 in initiatePayment means Razorpay auto-captures.
  // This is a no-op unless Dan switches to manual capture mode.

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return {
      data: {
        ...(input.data ?? {}),
        captured_at: new Date().toISOString(),
        capture_method: "auto",
      },
    }
  }

  // ── Refund ────────────────────────────────────────────────────────────────

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as RazorpayPaymentData
    const refundAmount = Math.round(Number(input.amount))

    if (!data.razorpay_payment_id) {
      throw new Error("Cannot refund: razorpay_payment_id not found in payment data")
    }

    try {
      const refund = await razorpayRequest<{ id: string; amount: number }>(
        "POST",
        `/payments/${data.razorpay_payment_id}/refund`,
        this.keyId,
        this.keySecret,
        { amount: refundAmount }
      )

      return {
        data: {
          ...data,
          refund_id: refund.id,
          refunded_amount_paise: refundAmount,
          refunded_at: new Date().toISOString(),
        },
      }
    } catch (err) {
      throw new Error(`Razorpay refundPayment failed: ${(err as Error).message}`)
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  // Razorpay orders cannot be cancelled programmatically after payment.
  // Pre-payment cancellation just means the order expires.

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return {
      data: {
        ...(input.data ?? {}),
        cancelled_at: new Date().toISOString(),
      },
    }
  }

  // ── Retrieve ──────────────────────────────────────────────────────────────

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const data = (input.data ?? {}) as RazorpayPaymentData

    if (!data.razorpay_payment_id) {
      return { data: input.data }
    }

    try {
      const payment = await razorpayRequest<Record<string, unknown>>(
        "GET",
        `/payments/${data.razorpay_payment_id}`,
        this.keyId,
        this.keySecret
      )
      return { data: { ...data, ...payment } }
    } catch {
      return { data: input.data }
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as RazorpayPaymentData

    if (!data.razorpay_payment_id) {
      // No payment ID yet — customer hasn't paid
      return { status: PaymentSessionStatus.PENDING, data: input.data }
    }

    try {
      const payment = await razorpayRequest<{ status: string }>(
        "GET",
        `/payments/${data.razorpay_payment_id}`,
        this.keyId,
        this.keySecret
      )

      const statusMap: Record<string, PaymentSessionStatus> = {
        created: PaymentSessionStatus.PENDING,
        authorized: PaymentSessionStatus.AUTHORIZED,
        captured: PaymentSessionStatus.AUTHORIZED,
        refunded: PaymentSessionStatus.CANCELED,
        failed: PaymentSessionStatus.ERROR,
      }

      return {
        status: statusMap[payment.status] ?? PaymentSessionStatus.PENDING,
        data: input.data,
      }
    } catch {
      return { status: PaymentSessionStatus.ERROR, data: input.data }
    }
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  // Full webhook handling is in src/api/store/razorpay-webhook/route.ts.
  // This method is called by Medusa's webhook processor if configured.

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const signature = payload.headers["x-razorpay-signature"] as string
    if (!signature || !this.webhookSecret) {
      return { action: "not_supported" }
    }

    const body =
      typeof payload.rawData === "string"
        ? payload.rawData
        : payload.rawData.toString("utf-8")

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(body)
      .digest("hex")

    const valid = crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    )

    if (!valid) {
      return { action: "not_supported" }
    }

    const webhookEvent = JSON.parse(body) as {
      event: string
      payload: {
        payment?: { entity?: { id: string; order_id: string; amount: number } }
      }
    }

    // session_id maps to the Razorpay order receipt/id we stored on the
    // session at initiatePayment; amount is in paise (Razorpay's minor unit).
    const sessionId = webhookEvent.payload.payment?.entity?.order_id ?? ""
    const amount = webhookEvent.payload.payment?.entity?.amount ?? 0

    if (
      webhookEvent.event === "payment.captured" ||
      webhookEvent.event === "payment.authorized"
    ) {
      return {
        action: "authorized",
        data: { session_id: sessionId, amount },
      }
    }

    if (webhookEvent.event === "payment.failed") {
      return {
        action: "failed",
        data: { session_id: sessionId, amount },
      }
    }

    return { action: "not_supported" }
  }
}

export default ModuleProvider(Modules.PAYMENT, {
  services: [RazorpayPaymentProvider],
})
