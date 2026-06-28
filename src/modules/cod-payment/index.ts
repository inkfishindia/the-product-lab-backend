/**
 * COD Payment Provider — The Product Lab
 *
 * Cash on Delivery is a "promise to pay" at the door.  No external gateway
 * is involved — the provider auto-authorises immediately.  Actual cash
 * collection happens at delivery; Shiprocket handles COD remittance.
 *
 * Business rule (D-006): COD only available on orders ≥ ₹299 (29900 paise).
 * The ₹299 floor is enforced in two layers:
 *   1. Storefront: COD option is hidden when cart.total < 29900  (UX gate)
 *   2. Server:     /store/validate-payment-method returns 400 if violated  (integrity gate)
 *
 * This provider itself is intentionally dumb — it authorises everything that
 * reaches it.  The floor enforcement must happen BEFORE the payment session
 * is created, not inside the provider.
 *
 * API: implements the Medusa v2.15.x AbstractPaymentProvider contract
 * (Input/Output object shapes, not the legacy positional signatures).
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

type CODPaymentData = {
  status?: string
  created_at?: string
}

class CODPaymentProvider extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "cod"

  // A public constructor is required so the class type is assignable to
  // Constructor<any> when registered via ModuleProvider (AbstractPaymentProvider
  // declares a protected constructor, which would otherwise block assignment).
  constructor(
    container: Record<string, unknown>,
    options: Record<string, never>
  ) {
    super(container, options)
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  async initiatePayment(
    _input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    return {
      id: `cod_${crypto.randomUUID()}`,
      status: PaymentSessionStatus.PENDING,
      data: {
        status: "pending_cod",
        created_at: new Date().toISOString(),
      },
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    return {
      status: PaymentSessionStatus.PENDING,
      data: {
        ...(input.data ?? {}),
        status: "pending_cod",
        updated_at: new Date().toISOString(),
      },
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    // No external resource to delete.
    return { data: input.data }
  }

  // ── Authorisation ─────────────────────────────────────────────────────────
  // COD is immediately "authorised" — payment will be collected on delivery.

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: {
        ...(input.data ?? {}),
        authorized_at: new Date().toISOString(),
      },
    }
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  // For COD: Shiprocket remits cash after delivery.  This is marked captured
  // manually in Medusa after the remittance lands (or via a future webhook).

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return {
      data: {
        ...(input.data ?? {}),
        captured_at: new Date().toISOString(),
        capture_method: "cod_remittance",
      },
    }
  }

  // ── Refund ────────────────────────────────────────────────────────────────
  // COD refunds are handled manually (bank transfer to customer after return).
  // Log the intent; actual refund is an ops task for Dan.

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const refundAmount = Number(input.amount)
    console.log(
      `[COD] Refund requested: ${refundAmount} (minor units) — handle manually via bank transfer.`
    )
    return {
      data: {
        ...(input.data ?? {}),
        refund_requested_at: new Date().toISOString(),
        refund_amount: refundAmount,
      },
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

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
  // No external provider — echo back the stored session data.

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as CODPaymentData
    const status =
      data.status === "pending_cod"
        ? PaymentSessionStatus.PENDING
        : PaymentSessionStatus.AUTHORIZED
    return { status, data: input.data }
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  // COD has no external webhook source.

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return { action: "not_supported" }
  }
}

export default ModuleProvider(Modules.PAYMENT, {
  services: [CODPaymentProvider],
})
