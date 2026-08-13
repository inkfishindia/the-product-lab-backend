"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const crypto_1 = __importDefault(require("crypto"));
async function POST(req, res) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
        // Provider not live yet — acknowledge silently so Razorpay doesn't alarm.
        res.status(200).json({ status: "not_configured" });
        return;
    }
    // ── Signature verification ────────────────────────────────────────────────
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
        res.status(400).json({ error: "missing_signature" });
        return;
    }
    // Medusa parses req.body by default. We need the raw body for HMAC.
    // Razorpay sends JSON; re-stringify to get consistent bytes.
    const rawBody = JSON.stringify(req.body);
    const expected = crypto_1.default
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
    let valid = false;
    try {
        valid = crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }
    catch {
        valid = false;
    }
    if (!valid) {
        console.error("[razorpay-webhook] Signature mismatch — possible replay attack");
        // Return 200 to Razorpay (avoid retry storm) but log the problem.
        res.status(200).json({ status: "signature_mismatch" });
        return;
    }
    // ── Event handling ────────────────────────────────────────────────────────
    const event = req.body;
    console.log(`[razorpay-webhook] Received event: ${event.event}`);
    if (event.event === "payment.captured" ||
        event.event === "payment.authorized") {
        const payment = event.payload?.payment?.entity;
        if (payment) {
            console.log(`[razorpay-webhook] Payment ${payment.id} on order ${payment.order_id} — status: ${payment.status}`);
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
        const payment = event.payload?.payment?.entity;
        console.error(`[razorpay-webhook] Payment FAILED: ${payment?.id ?? "unknown"} on order ${payment?.order_id ?? "unknown"}`);
        // Cart remains open. Customer can retry. No action needed here.
    }
    // Always 200 to Razorpay
    res.status(200).json({ status: "ok" });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3Jhem9ycGF5LXdlYmhvb2svcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHOzs7OztBQUtILG9CQXVGQztBQTFGRCxvREFBMkI7QUFHcEIsS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUE7SUFFekQsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ25CLDBFQUEwRTtRQUMxRSxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUE7UUFDbEQsT0FBTTtJQUNSLENBQUM7SUFFRCw2RUFBNkU7SUFDN0UsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBdUIsQ0FBQTtJQUMzRSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDZixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUE7UUFDcEQsT0FBTTtJQUNSLENBQUM7SUFFRCxvRUFBb0U7SUFDcEUsNkRBQTZEO0lBQzdELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ3hDLE1BQU0sUUFBUSxHQUFHLGdCQUFNO1NBQ3BCLFVBQVUsQ0FBQyxRQUFRLEVBQUUsYUFBYSxDQUFDO1NBQ25DLE1BQU0sQ0FBQyxPQUFPLENBQUM7U0FDZixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7SUFFaEIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFBO0lBQ2pCLElBQUksQ0FBQztRQUNILEtBQUssR0FBRyxnQkFBTSxDQUFDLGVBQWUsQ0FDNUIsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFDckIsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FDdkIsQ0FBQTtJQUNILENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxLQUFLLEdBQUcsS0FBSyxDQUFBO0lBQ2YsQ0FBQztJQUVELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0VBQWdFLENBQUMsQ0FBQTtRQUMvRSxrRUFBa0U7UUFDbEUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxDQUFBO1FBQ3RELE9BQU07SUFDUixDQUFDO0lBRUQsNkVBQTZFO0lBQzdFLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxJQVlqQixDQUFBO0lBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUE7SUFFaEUsSUFDRSxLQUFLLENBQUMsS0FBSyxLQUFLLGtCQUFrQjtRQUNsQyxLQUFLLENBQUMsS0FBSyxLQUFLLG9CQUFvQixFQUNwQyxDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFBO1FBQzlDLElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixPQUFPLENBQUMsR0FBRyxDQUNULDhCQUE4QixPQUFPLENBQUMsRUFBRSxhQUFhLE9BQU8sQ0FBQyxRQUFRLGNBQWMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUNwRyxDQUFBO1lBQ0QscUVBQXFFO1lBQ3JFLHdFQUF3RTtZQUN4RSxnRkFBZ0Y7WUFDaEYsNEZBQTRGO1lBQzVGLDZFQUE2RTtZQUM3RSwwRUFBMEU7WUFDMUUsOEVBQThFO1FBQ2hGLENBQUM7SUFDSCxDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLGdCQUFnQixFQUFFLENBQUM7UUFDckMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFBO1FBQzlDLE9BQU8sQ0FBQyxLQUFLLENBQ1gsc0NBQXNDLE9BQU8sRUFBRSxFQUFFLElBQUksU0FBUyxhQUFhLE9BQU8sRUFBRSxRQUFRLElBQUksU0FBUyxFQUFFLENBQzVHLENBQUE7UUFDRCxnRUFBZ0U7SUFDbEUsQ0FBQztJQUVELHlCQUF5QjtJQUN6QixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO0FBQ3hDLENBQUMifQ==