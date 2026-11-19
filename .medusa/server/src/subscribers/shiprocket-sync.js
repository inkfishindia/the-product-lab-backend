"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = shiprocketSync;
const utils_1 = require("@medusajs/framework/utils");
// ── Token cache ───────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;
async function getShiprocketToken(email, password) {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }
    const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        throw new Error(`Shiprocket auth failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    cachedToken = data.token;
    // Expire 23h from now (JWT is 24h, give 1h buffer)
    tokenExpiresAt = now + 23 * 60 * 60 * 1000;
    return cachedToken;
}
async function createShiprocketOrder(token, payload) {
    const res = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`Shiprocket order creation failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
}
// ── Subscriber ────────────────────────────────────────────────────────────────
async function shiprocketSync({ event: { data }, container, }) {
    // ── Dormancy gate ─────────────────────────────────────────────────────────
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;
    const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";
    if (!email || !password) {
        // Shiprocket creds not configured — skip silently.
        return;
    }
    const orderId = data.id;
    try {
        // ── Fetch order from Medusa ─────────────────────────────────────────────
        const orderModuleService = container.resolve(utils_1.Modules.ORDER);
        const order = await orderModuleService.retrieveOrder(orderId, {
            relations: [
                "items",
                "shipping_address",
                "billing_address",
                "payment_collections",
                "payment_collections.payments",
                "shipping_methods",
            ],
        });
        // ── Determine payment method ────────────────────────────────────────────
        // Check the payment provider on the order's payment collection.
        const typedOrder = order;
        const paymentProviderId = typedOrder.payment_collections?.[0]?.payments?.[0]?.provider_id ?? "";
        const paymentMethod = paymentProviderId === "cod" ? "COD" : "Prepaid";
        const addr = typedOrder.shipping_address;
        // ── Build Shiprocket payload ────────────────────────────────────────────
        const shiprocketPayload = {
            order_id: `TPL-${typedOrder.display_id ?? orderId.slice(-8)}`,
            order_date: new Date(typedOrder.created_at).toISOString().split("T")[0],
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
        };
        // ── Authenticate and create order ───────────────────────────────────────
        const token = await getShiprocketToken(email, password);
        const result = await createShiprocketOrder(token, shiprocketPayload);
        console.log(`[shiprocket-sync] Order ${orderId} pushed to Shiprocket. ` +
            `SR order_id: ${result.order_id}, shipment_id: ${result.shipment_id}, ` +
            `payment_method: ${paymentMethod}`);
        // ── Store Shiprocket IDs in order metadata ──────────────────────────────
        try {
            await orderModuleService.updateOrders([{
                    id: orderId,
                    metadata: {
                        shiprocket_order_id: String(result.order_id),
                        shiprocket_shipment_id: String(result.shipment_id),
                        shiprocket_payment_method: paymentMethod,
                    },
                }]);
        }
        catch (metaErr) {
            // Metadata update failure is non-critical — log and continue.
            console.warn("[shiprocket-sync] Could not update order metadata:", metaErr);
        }
    }
    catch (err) {
        // ── Non-blocking error handling ─────────────────────────────────────────
        // ANY Shiprocket failure is caught here.  The order has already been
        // created in Medusa.  Dan can create the Shiprocket order manually from
        // the Medusa order details if this fails.
        console.error(`[shiprocket-sync] FAILED for order ${orderId} — order NOT affected. ` +
            `Error: ${err.message}`);
        // TODO (go-live): Send alert to Dan's WhatsApp/email when Shiprocket fails.
        // Options: Slack webhook, email via Resend/Mailchimp, or a simple
        // admin-email via Medusa's notification module.
    }
}
exports.config = {
    event: "order.placed",
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hpcHJvY2tldC1zeW5jLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3N1YnNjcmliZXJzL3NoaXByb2NrZXQtc3luYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0E0Qkc7OztBQW1HSCxpQ0EySUM7QUEzT0QscURBQW1EO0FBRW5ELGlGQUFpRjtBQUVqRixJQUFJLFdBQVcsR0FBa0IsSUFBSSxDQUFBO0FBQ3JDLElBQUksY0FBYyxHQUFXLENBQUMsQ0FBQTtBQUU5QixLQUFLLFVBQVUsa0JBQWtCLENBQUMsS0FBYSxFQUFFLFFBQWdCO0lBQy9ELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQTtJQUV0QixJQUFJLFdBQVcsSUFBSSxHQUFHLEdBQUcsY0FBYyxFQUFFLENBQUM7UUFDeEMsT0FBTyxXQUFXLENBQUE7SUFDcEIsQ0FBQztJQUVELE1BQU0sR0FBRyxHQUFHLE1BQU0sS0FBSyxDQUFDLG9EQUFvRCxFQUFFO1FBQzVFLE1BQU0sRUFBRSxNQUFNO1FBQ2QsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFO1FBQy9DLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDO0tBQzFDLENBQUMsQ0FBQTtJQUVGLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDWixNQUFNLElBQUksS0FBSyxDQUFDLDJCQUEyQixHQUFHLENBQUMsTUFBTSxJQUFJLE1BQU0sR0FBRyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQTtJQUM5RSxDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxFQUF1QixDQUFBO0lBQ2xELFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFBO0lBQ3hCLG1EQUFtRDtJQUNuRCxjQUFjLEdB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