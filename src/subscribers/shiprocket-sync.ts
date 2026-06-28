/**
 * Shiprocket Order Sync Subscriber — The Product Lab
 *
 * Fires on order.placed event.  Pushes the order to Shiprocket so it can be
 * picked up and shipped.
 *
 * DORMANCY CONTRACT:
 * The subscriber returns immediately if SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD
 * are not set.  No error is thrown; the order completes normally.  This means
 * the integration is fully dormant until Dan pastes credentials — no code change
 * required at go-live.
 *
 * NON-BLOCKING GUARANTEE (Risk 2):
 * ALL Shiprocket API calls are wrapped in try/catch.  Any failure is logged
 * but NEVER propagated.  A Shiprocket outage cannot break order completion.
 *
 * TOKEN REFRESH:
 * Shiprocket JWTs expire every 24h.  The token is cached in module-level memory
 * with an expiry timestamp.  A single-instance server (D-012 = solo operator,
 * no clustering) makes this safe.
 *
 * REQUIRED ENV VARS:
 *   SHIPROCKET_EMAIL=<account email>
 *   SHIPROCKET_PASSWORD=<account password>
 *   SHIPROCKET_PICKUP_LOCATION=<pickup location name in Shiprocket dashboard>
 *
 * The pickup location must be created in the Shiprocket dashboard before
 * the first real order.  See go-live handoff for steps.
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

// ── Token cache ───────────────────────────────────────────────────────────────

let cachedToken: string | null = null
let tokenExpiresAt: number = 0

async function getShiprocketToken(email: string, password: string): Promise<string> {
  const now = Date.now()

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken
  }

  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    throw new Error(`Shiprocket auth failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { token: string }
  cachedToken = data.token
  // Expire 23h from now (JWT is 24h, give 1h buffer)
  tokenExpiresAt = now + 23 * 60 * 60 * 1000

  return cachedToken
}

// ── Shiprocket order creation ─────────────────────────────────────────────────

type ShiprocketOrderPayload = {
  order_id: string
  order_date: string
  pickup_location: string
  channel_id?: string
  comment?: string
  billing_customer_name: string
  billing_last_name?: string
  billing_address: string
  billing_city: string
  billing_pincode: string
  billing_state: string
  billing_country: string
  billing_email: string
  billing_phone: string
  shipping_is_billing: boolean
  order_items: Array<{
    name: string
    sku: string
    units: number
    selling_price: number
    discount?: number
    tax?: number
    hsn?: number
  }>
  payment_method: "COD" | "Prepaid"
  shipping_charges?: number
  giftwrap_charges?: number
  transaction_charges?: number
  total_discount?: number
  sub_total: number
  length?: number
  breadth?: number
  height?: number
  weight: number
}

async function createShiprocketOrder(
  token: string,
  payload: ShiprocketOrderPayload
): Promise<{ order_id: number; shipment_id: number; status: string }> {
  const res = await fetch(
    "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    throw new Error(`Shiprocket order creation failed: ${res.status} ${await res.text()}`)
  }

  return res.json() as Promise<{ order_id: number; shipment_id: number; status: string }>
}

// ── Subscriber ────────────────────────────────────────────────────────────────

export default async function shiprocketSync({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  // ── Dormancy gate ─────────────────────────────────────────────────────────
  const email = process.env.SHIPROCKET_EMAIL
  const password = process.env.SHIPROCKET_PASSWORD
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || "Primary"

  if (!email || !password) {
    // Shiprocket creds not configured — skip silently.
    return
  }

  const orderId = data.id

  try {
    // ── Fetch order from Medusa ─────────────────────────────────────────────
    const orderModuleService = container.resolve(Modules.ORDER)

    const order = await orderModuleService.retrieveOrder(orderId, {
      relations: [
        "items",
        "shipping_address",
        "billing_address",
        "payment_collections",
        "payment_collections.payments",
        "shipping_methods",
      ],
    })

    // ── Determine payment method ────────────────────────────────────────────
    // Check the payment provider on the order's payment collection.
    const typedOrder = order as {
      id: string
      display_id?: number
      created_at: string
      items: Array<{
        title: string
        variant_sku?: string
        quantity: number
        unit_price: number
      }>
      shipping_address?: {
        first_name?: string
        last_name?: string
        address_1?: string
        city?: string
        postal_code?: string
        province?: string
        country_code?: string
        email?: string
        phone?: string
      }
      email?: string
      payment_collections?: Array<{
        payments?: Array<{ provider_id?: string }>
      }>
      total?: number
      item_total?: number
    }

    const paymentProviderId =
      typedOrder.payment_collections?.[0]?.payments?.[0]?.provider_id ?? ""

    const paymentMethod: "COD" | "Prepaid" =
      paymentProviderId === "cod" ? "COD" : "Prepaid"

    const addr = typedOrder.shipping_address

    // ── Build Shiprocket payload ────────────────────────────────────────────
    const shiprocketPayload: ShiprocketOrderPayload = {
      order_id: `TPL-${typedOrder.display_id ?? orderId.slice(-8)}`,
      order_date: new Date(typedOrder.created_at).toISOString().split("T")[0]!,
      pickup_location: pickupLocation,
      billing_customer_name: addr?.first_name ?? "Customer",
      billing_last_name: addr?.last_name ?? "",
      billing_address: addr?.address_1 ?? "",
      billing_city: addr?.city ?? "",
      billing_pincode: addr?.postal_code ?? "",
      billing_state: addr?.province ?? "",
      billing_country: "India",
      billing_email: typedOrder.email ?? "",
      billing_phone: addr?.phone ?? "0000000000",
      shipping_is_billing: true,
      order_items: typedOrder.items.map((item) => ({
        name: item.title,
        sku: item.variant_sku ?? item.title.slice(0, 20),
        units: item.quantity,
        selling_price: Math.round(item.unit_price / 100), // paise → INR
        tax: 18,
        hsn: 83177000, // HSN for miscellaneous articles (reasonable for accessories)
      })),
      payment_method: paymentMethod,
      sub_total: Math.round((typedOrder.item_total ?? 0) / 100),
      weight: 0.1, // 100g default — TPL accessories are light
      length: 10,
      breadth: 10,
      height: 2,
    }

    // ── Authenticate and create order ───────────────────────────────────────
    const token = await getShiprocketToken(email, password)
    const result = await createShiprocketOrder(token, shiprocketPayload)

    console.log(
      `[shiprocket-sync] Order ${orderId} pushed to Shiprocket. ` +
        `SR order_id: ${result.order_id}, shipment_id: ${result.shipment_id}, ` +
        `payment_method: ${paymentMethod}`
    )

    // ── Store Shiprocket IDs in order metadata ──────────────────────────────
    try {
      await orderModuleService.updateOrders([{
        id: orderId,
        metadata: {
          shiprocket_order_id: String(result.order_id),
          shiprocket_shipment_id: String(result.shipment_id),
          shiprocket_payment_method: paymentMethod,
        },
      }])
    } catch (metaErr) {
      // Metadata update failure is non-critical — log and continue.
      console.warn("[shiprocket-sync] Could not update order metadata:", metaErr)
    }
  } catch (err) {
    // ── Non-blocking error handling ─────────────────────────────────────────
    // ANY Shiprocket failure is caught here.  The order has already been
    // created in Medusa.  Dan can create the Shiprocket order manually from
    // the Medusa order details if this fails.
    console.error(
      `[shiprocket-sync] FAILED for order ${orderId} — order NOT affected. ` +
        `Error: ${(err as Error).message}`
    )

    // TODO (go-live): Send alert to Dan's WhatsApp/email when Shiprocket fails.
    // Options: Slack webhook, email via Resend/Mailchimp, or a simple
    // admin-email via Medusa's notification module.
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
