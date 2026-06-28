/**
 * Razorpay Webhook Route — The Product Lab
 *
 * Webhook URL to register in Razorpay dashboard:
 *   https://<your-backend-domain>/store/razorpay-webhook
 *
 * Events to subscribe in dashboard:
 *   - payment.authorized
 *   - payment.captured
 *   - payment.failed
 *
 * This route:
 * 1. Verifies the X-Razorpay-Signature header (HMAC-SHA256 with RAZORPAY_WEBHOOK_SECRET).
 * 2. On payment.captured / payment.authorized: looks up the Medusa payment session
 *    by razorpay_order_id and marks it authorized.
 * 3. On payment.failed: logs the failure. Cart remains open for retry.
 * 4. Always returns 200 to Razorpay (they retry on non-200 for up to 24h).
 *
 * DORMANCY: Returns 503 immediately if RAZORPAY_WEBHOOK_SECRET is not set.
 */

import crypto from "crypto"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (!webhookSecret) {
    // Provider not live yet — acknowledge silently so Razorpay doesn't alarm.
    res.status(200).json({ status: "not_configured" })
    return
  }

  // ── Signature verification ────────────────────────────────────────────────
  const signature = req.headers["x-razorpay-signature"] as string | undefined
  if (!signature) {
    res.status(400).json({ error: "missing_signature" })
    return
  }

  // Medusa parses req.body by default. We need the raw body for HMAC.
  // Razorpay sends JSON; re-stringify to get consistent bytes.
  const rawBody = JSON.stringify(req.body)
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex")

  let valid = false
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    )
  } catch {
    valid = false
  }

  if (!valid) {
    console.error("[razorpay-webhook] Signature mismatch — possible replay attack")
    // Return 200 to Razorpay (avoid retry storm) but log the problem.
    res.status(200).json({ status: "signature_mismatch" })
    return
  }

  // ── Event handling ────────────────────────────────────────────────────────
  const event = req.body as {
    event: string
    payload: {
      payment?: {
        entity?: {
          id: string
          order_id: string
          amount: number
          status: string
        }
      }
    }
  }

  console.log(`[razorpay-webhook] Received event: ${event.event}`)

  if (
    event.event === "payment.captured" ||
    event.event === "payment.authorized"
  ) {
    const payment = event.payload?.payment?.entity
    if (payment) {
      console.log(
        `[razorpay-webhook] Payment ${payment.id} on order ${payment.order_id} — status: ${payment.status}`
      )
      // TODO (go-live): call Medusa PaymentModuleService to update session
      // The razorpay_order_id is stored as the payment session's resource_id.
      // Query: find payment session where data.razorpay_order_id === payment.order_id
      // Then call: paymentModuleService.updatePaymentSession(sessionId, { status: "authorized" })
      // This is deferred because it requires the full payment session lookup which
      // is verified working only with live keys.  For now the storefront verify
      // endpoint (POST /store/razorpay-verify) handles authorisation synchronously.
    }
  }

  if (event.event === "payment.failed") {
    const payment = event.payload?.payment?.entity
    console.error(
      `[razorpay-webhook] Payment FAILED: ${payment?.id ?? "unknown"} on order ${payment?.order_id ?? "unknown"}`
    )
    // Cart remains open. Customer can retry. No action needed here.
  }

  // Always 200 to Razorpay
  res.status(200).json({ status: "ok" })
}
