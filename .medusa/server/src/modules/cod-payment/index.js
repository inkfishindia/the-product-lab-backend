"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const utils_1 = require("@medusajs/framework/utils");
class CODPaymentProvider extends utils_1.AbstractPaymentProvider {
    // A public constructor is required so the class type is assignable to
    // Constructor<any> when registered via ModuleProvider (AbstractPaymentProvider
    // declares a protected constructor, which would otherwise block assignment).
    constructor(container, options) {
        super(container, options);
    }
    // ── Session lifecycle ─────────────────────────────────────────────────────
    async initiatePayment(_input) {
        return {
            id: `cod_${crypto_1.default.randomUUID()}`,
            status: utils_1.PaymentSessionStatus.PENDING,
            data: {
                status: "pending_cod",
                created_at: new Date().toISOString(),
            },
        };
    }
    async updatePayment(input) {
        return {
            status: utils_1.PaymentSessionStatus.PENDING,
            data: {
                ...(input.data ?? {}),
                status: "pending_cod",
                updated_at: new Date().toISOString(),
            },
        };
    }
    async deletePayment(input) {
        // No external resource to delete.
        return { data: input.data };
    }
    // ── Authorisation ─────────────────────────────────────────────────────────
    // COD is immediately "authorised" — payment will be collected on delivery.
    async authorizePayment(input) {
        return {
            status: utils_1.PaymentSessionStatus.AUTHORIZED,
            data: {
                ...(input.data ?? {}),
                authorized_at: new Date().toISOString(),
            },
        };
    }
    // ── Capture ───────────────────────────────────────────────────────────────
    // For COD: Shiprocket remits cash after delivery.  This is marked captured
    // manually in Medusa after the remittance lands (or via a future webhook).
    async capturePayment(input) {
        return {
            data: {
                ...(input.data ?? {}),
                captured_at: new Date().toISOString(),
                capture_method: "cod_remittance",
            },
        };
    }
    // ── Refund ────────────────────────────────────────────────────────────────
    // COD refunds are handled manually (bank transfer to customer after return).
    // Log the intent; actual refund is an ops task for Dan.
    async refundPayment(input) {
        const refundAmount = Number(input.amount);
        console.log(`[COD] Refund requested: ${refundAmount} (minor units) — handle manually via bank transfer.`);
        return {
            data: {
                ...(input.data ?? {}),
                refund_requested_at: new Date().toISOString(),
                refund_amount: refundAmount,
            },
        };
    }
    // ── Cancel ────────────────────────────────────────────────────────────────
    async cancelPayment(input) {
        return {
            data: {
                ...(input.data ?? {}),
                cancelled_at: new Date().toISOString(),
            },
        };
    }
    // ── Retrieve ──────────────────────────────────────────────────────────────
    // No external provider — echo back the stored session data.
    async retrievePayment(input) {
        return { data: input.data };
    }
    // ── Status ────────────────────────────────────────────────────────────────
    async getPaymentStatus(input) {
        const data = (input.data ?? {});
        const status = data.status === "pending_cod"
            ? utils_1.PaymentSessionStatus.PENDING
            : utils_1.PaymentSessionStatus.AUTHORIZED;
        return { status, data: input.data };
    }
    // ── Webhooks ──────────────────────────────────────────────────────────────
    // COD has no external webhook source.
    async getWebhookActionAndData(_payload) {
        return { action: "not_supported" };
    }
}
CODPaymentProvider.identifier = "cod";
exports.default = (0, utils_1.ModuleProvider)(utils_1.Modules.PAYMENT, {
    services: [CODPaymentProvider],
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9jb2QtcGF5bWVudC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRzs7Ozs7QUFFSCxvREFBMkI7QUFDM0IscURBS2tDO0FBNkJsQyxNQUFNLGtCQUFtQixTQUFRLCtCQUE4QztJQUc3RSxzRUFBc0U7SUFDdEUsK0VBQStFO0lBQy9FLDZFQUE2RTtJQUM3RSxZQUNFLFNBQWtDLEVBQ2xDLE9BQThCO1FBRTlCLEtBQUssQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUE7SUFDM0IsQ0FBQztJQUVELDZFQUE2RTtJQUU3RSxLQUFLLENBQUMsZUFBZSxDQUNuQixNQUE0QjtRQUU1QixPQUFPO1lBQ0wsRUFBRSxFQUFFLE9BQU8sZ0JBQU0sQ0FBQyxVQUFVLEVBQUUsRUFBRTtZQUNoQyxNQUFNLEVBQUUsNEJBQW9CLENBQUMsT0FBTztZQUNwQyxJQUFJLEVBQUU7Z0JBQ0osTUFBTSxFQUFFLGFBQWE7Z0JBQ3JCLFVBQVUsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTthQUNyQztTQUNGLENBQUE7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FDakIsS0FBeUI7UUFFekIsT0FBTztZQUNMLE1BQU0sRUFBRSw0QkFBb0IsQ0FBQyxPQUFPO1lBQ3BDLElBQUksRUFBRTtnQkFDSixHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sRUFBRSxhQUFhO2dCQUNyQixVQUFVLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDckM7U0FDRixDQUFBO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxhQUFhLENBQ2pCLEtBQXlCO1FBRXpCLGtDQUFrQztRQUNsQyxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJ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