"use strict";
/**
 * POST /store/validate-payment-method
 *
 * Server-side integrity gate for the COD ₹299 minimum (D-006).
 * Called from the storefront BEFORE cart.complete() to prevent a crafty
 * client from bypassing the frontend gate.
 *
 * Request body:
 *   { cart_id: string, provider_id: "cod" | "razorpay" }
 *
 * Returns:
 *   200 { valid: true }                    — proceed to complete
 *   400 { valid: false, reason: string }   — block completion
 *
 * Business rules enforced here (all from D-006):
 *   - COD requires cart total >= ₹299 (29900 paise)
 *   - Razorpay has no minimum (any amount is fine)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const COD_MINIMUM_PAISE = 29900; // ₹299 × 100
async function POST(req, res) {
    const { cart_id, provider_id } = req.body;
    if (!cart_id || !provider_id) {
        res.status(400).json({ valid: false, reason: "cart_id and provider_id are required" });
        return;
    }
    if (provider_id !== "cod") {
        // Non-COD payment methods have no minimum enforced here.
        res.status(200).json({ valid: true });
        return;
    }
    try {
        const cartModuleService = req.scope.resolve(utils_1.Modules.CART);
        const [cart] = await cartModuleService.listCarts({ id: [cart_id] }, { select: ["id", "total", "item_total", "shipping_total", "tax_total"] });
        if (!cart) {
            res.status(400).json({ valid: false, reason: "cart_not_found" });
            return;
        }
        // Medusa stores totals in paise (smallest currency unit for INR).
        // `total` includes shipping + tax.
        const cartTotal = cart.total ?? 0;
        if (cartTotal < COD_MINIMUM_PAISE) {
            res.status(400).json({
                valid: false,
                reason: `COD is only available on orders of ₹299 or more. Your cart total is ₹${Math.round(cartTotal / 100)}.`,
                minimum_inr: 299,
                cart_total_inr: Math.round(cartTotal / 100),
            });
            return;
        }
        res.status(200).json({ valid: true });
    }
    catch (err) {
        console.error("[validate-payment-method] Error:", err);
        res.status(500).json({ valid: false, reason: "internal_error" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3ZhbGlkYXRlLXBheW1lbnQtbWV0aG9kL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FpQkc7O0FBT0gsb0JBZ0RDO0FBcERELHFEQUFtRDtBQUVuRCxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQSxDQUFDLGFBQWE7QUFFdEMsS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEdBQUcsR0FBRyxDQUFDLElBR3BDLENBQUE7SUFFRCxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDN0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxzQ0FBc0MsRUFBRSxDQUFDLENBQUE7UUFDdEYsT0FBTTtJQUNSLENBQUM7SUFFRCxJQUFJLFdBQVcsS0FBSyxLQUFLLEVBQUUsQ0FBQztRQUMxQix5REFBeUQ7UUFDekQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtRQUNyQyxPQUFNO0lBQ1IsQ0FBQztJQUVELElBQUksQ0FBQztRQUNILE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ3pELE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLGlCQUFpQixDQUFDLFNBQVMsQ0FDOUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUNqQixFQUFFLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQ3pFLENBQUE7UUFFRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDVixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQTtZQUNoRSxPQUFNO1FBQ1IsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxtQ0FBbUM7UUFDbkMsTUFBTSxTQUFTLEdBQUksSUFBMkIsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFBO1FBRXpELElBQUksU0FBUyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDbEMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ25CLEtBQUssRUFBRSxLQUFLO2dCQUNaLE1BQU0sRUFBRSx3RUFBd0UsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDLEdBQUc7Z0JBQzlHLFdBQVcsRUFBRSxHQUFHO2dCQUNoQixjQUFjLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDO2FBQzVDLENBQUMsQ0FBQTtZQUNGLE9BQU07UUFDUixDQUFDO1FBRUQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtJQUN2QyxDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDdEQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUE7SUFDbEUsQ0FBQztBQUNILENBQUMifQ==