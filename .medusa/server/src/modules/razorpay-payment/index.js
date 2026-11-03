"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const utils_1 = require("@medusajs/framework/utils");
// ── Helpers ───────────────────────────────────────────────────────────────────
async function razorpayRequest(method, path, keyId, keySecret, body) {
    const base64Auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const url = `https://api.razorpay.com/v1${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Basic ${base64Auth}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Razorpay API error ${res.status}: ${errorBody}`);
    }
    return res.json();
}
function verifyRazorpaySignature(orderId, paymentId, signature, keySecret) {
    const payload = `${orderId}|${paymentId}`;
    const expected = crypto_1.default
        .createHmac("sha256", keySecret)
        .update(payload)
        .digest("hex");
    return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
// ── Provider ──────────────────────────────────────────────────────────────────
class RazorpayPaymentProvider extends utils_1.AbstractPaymentProvider {
    constructor(container, options) {
        super(container, options);
        this.keyId = options.key_id;
        this.keySecret = options.key_secret;
        this.webhookSecret = options.webhook_secret || "";
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
    async initiatePayment(input) {
        try {
            const order = await razorpayRequest("POST", "/orders", this.keyId, this.keySecret, {
                amount: Math.round(Number(input.amount)), // paise
                currency: (input.currency_code || "inr").toUpperCase(),
                receipt: `tpl_${crypto_1.default.randomUUID()}`,
                payment_capture: 1, // auto-capture after authorisation
            });
            return {
                id: order.id,
                status: utils_1.PaymentSessionStatus.PENDING,
                data: {
                    razorpay_order_id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    status: "created",
                },
            };
        }
        catch (err) {
            throw new Error(`Razorpay initiatePayment failed: ${err.message}`);
        }
    }
    async updatePayment(input) {
        // Amount changes are rare for TPL (fixed-price accessories).
        // Re-create the Razorpay order if the amount changed.
        return this.initiatePayment(input);
    }
    async deletePayment(input) {
        // Razorpay orders are deleted by expiry (default 15 min after creation).
        // Nothing to do here.
        return { data: input.data };
    }
    // ── Authorisation ─────────────────────────────────────────────────────────
    /**
     * Verifies the HMAC-SHA256 signature that Razorpay passes to the storefront
     * handler callback.  The storefront POSTs these three fields to
     * /store/razorpay-webhook after payment succeeds.
     */
    async authorizePayment(input) {
        const data = (input.data ?? {});
        if (!data.razorpay_payment_id || !data.razorpay_order_id || !data.razorpay_signature) {
            return {
                status: utils_1.PaymentSessionStatus.PENDING,
                data: { ...data, error: "missing_razorpay_fields" },
            };
        }
        const valid = verifyRazorpaySignature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature, this.keySecret);
        if (!valid) {
            return {
                status: utils_1.PaymentSessionStatus.ERROR,
                data: { ...data, error: "signature_mismatch" },
            };
        }
        return {
            status: utils_1.PaymentSessionStatus.AUTHORIZED,
            data: {
                ...data,
                authorized_at: new Date().toISOString(),
            },
        };
    }
    // ── Capture ───────────────────────────────────────────────────────────────
    // payment_capture: 1 in initiatePayment means Razorpay auto-captures.
    // This is a no-op unless Dan switches to manual capture mode.
    async capturePayment(input) {
        return {
            data: {
                ...(input.data ?? {}),
                captured_at: new Date().toISOString(),
                capture_method: "auto",
            },
        };
    }
    // ── Refund ────────────────────────────────────────────────────────────────
    async refundPayment(input) {
        const data = (input.data ?? {});
        const refundAmount = Math.round(Number(input.amount));
        if (!data.razorpay_payment_id) {
            throw new Error("Cannot refund: razorpay_payment_id not found in payment data");
        }
        try {
            const refund = await razorpayRequest("POST", `/payments/${data.razorpay_payment_id}/refund`, this.keyId, this.keySecret, { amount: refundAmount });
            return {
                data: {
                    ...data,
                    refund_id: refund.id,
                    refunded_amount_paise: refundAmount,
                    refunded_at: new Date().toISOString(),
                },
            };
        }
        catch (err) {
            throw new Error(`Razorpay refundPayment failed: ${err.message}`);
        }
    }
    // ── Cancel ────────────────────────────────────────────────────────────────
    // Razorpay orders cannot be cancelled programmatically after payment.
    // Pre-payment cancellation just means the order expires.
    async cancelPayment(input) {
        return {
            data: {
                ...(input.data ?? {}),
                cancelled_at: new Date().toISOString(),
            },
        };
    }
    // ── Retrieve ──────────────────────────────────────────────────────────────
    async retrievePayment(input) {
        const data = (input.data ?? {});
        if (!data.razorpay_payment_id) {
            return { data: input.data };
        }
        try {
            const payment = await razorpayRequest("GET", `/payments/${data.razorpay_payment_id}`, this.keyId, this.keySecret);
            return { data: { ...data, ...payment } };
        }
        catch {
            return { data: input.data };
        }
    }
    // ── Status ────────────────────────────────────────────────────────────────
    async getPaymentStatus(input) {
        const data = (input.data ?? {});
        if (!data.razorpay_payment_id) {
            // No payment ID yet — customer hasn't paid
            return { status: utils_1.PaymentSessionStatus.PENDING, data: input.data };
        }
        try {
            const payment = await razorpayRequest("GET", `/payments/${data.razorpay_payment_id}`, this.keyId, this.keySecret);
            const statusMap = {
                created: utils_1.PaymentSessionStatus.PENDING,
                authorized: utils_1.PaymentSessionStatus.AUTHORIZED,
                captured: utils_1.PaymentSessionStatus.AUTHORIZED,
                refunded: utils_1.PaymentSessionStatus.CANCELED,
                failed: utils_1.PaymentSessionStatus.ERROR,
            };
            return {
                status: statusMap[payment.status] ?? utils_1.PaymentSessionStatus.PENDING,
                data: input.data,
            };
        }
        catch {
            return { status: utils_1.PaymentSessionStatus.ERROR, data: input.data };
        }
    }
    // ── Webhooks ──────────────────────────────────────────────────────────────
    // Full webhook handling is in src/api/store/razorpay-webhook/route.ts.
    // This method is called by Medusa's webhook processor if configured.
    async getWebhookActionAndData(payload) {
        const signature = payload.headers["x-razorpay-signature"];
        if (!signature || !this.webhookSecret) {
            return { action: "not_supported" };
        }
        const body = typeof payload.rawData === "string"
            ? payload.rawData
            : payload.rawData.toString("utf-8");
        const expected = crypto_1.default
            .createHmac("sha256", this.webhookSecret)
            .update(body)
            .digest("hex");
        const valid = crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
        if (!valid) {
            return { action: "not_supported" };
        }
        const webhookEvent = JSON.parse(body);
        // session_id maps to the Razorpay order receipt/id we stored on the
        // session at initiatePayment; amount is in paise (Razorpay's minor unit).
        const sessionId = webhookEvent.payload.payment?.entity?.order_id ?? "";
        const amount = webhookEvent.payload.payment?.entity?.amount ?? 0;
        if (webhookEvent.event === "payment.captured" ||
            webhookEvent.event === "payment.authorized") {
            return {
                action: "authorized",
                data: { session_id: sessionId, amount },
            };
        }
        if (webhookEvent.event === "payment.failed") {
            return {
                action: "failed",
                data: { session_id: sessionId, amount },
            };
        }
        return { action: "not_supported" };
    }
}
RazorpayPaymentProvider.identifier = "razorpay";
exports.default = (0, utils_1.ModuleProvider)(utils_1.Modules.PAYMENT, {
    services: [RazorpayPaymentProvider],
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9yYXpvcnBheS1wYXltZW50L2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0NHOzs7OztBQUVILG9EQUEyQjtBQUMzQixxREFLa0M7QUFpRGxDLGlGQUFpRjtBQUVqRixLQUFLLFVBQVUsZUFBZSxDQUM1QixNQUFzQixFQUN0QixJQUFZLEVBQ1osS0FBYSxFQUNiLFNBQWlCLEVBQ2pCLElBQWE7SUFFYixNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBO0lBQzFFLE1BQU0sR0FBRyxHQUFHLDhCQUE4QixJQUFJLEVBQUUsQ0FBQTtJQUVoRCxNQUFNLEdBQUcsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDM0IsTUFBTTtRQUNOLE9BQU8sRUFBRTtZQUNQLGFBQWEsRUFBRSxTQUFTLFVBQVUsRUFBRTtZQUNwQyxjQUFjLEVBQUUsa0JBQWtCO1NBQ25DO1FBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztLQUM5QyxDQUFDLENBQUE7SUFFRixJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ1osTUFBTSxTQUFTLEdBQUcsTUFBTSxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUE7UUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsR0FBRyxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQyxDQUFBO0lBQ25FLENBQUM7SUFFRCxPQUFPLEdBQUcsQ0FBQyxJQUFJLEVBQWdCLENBQUE7QUFDakMsQ0FBQztB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