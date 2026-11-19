"use strict";
/**
 * Prepaid ₹30 Discount Endpoints — The Product Lab
 *
 * D-006: prepaid (Razorpay) orders get ₹30 off; COD orders do not.
 *
 * POST /store/prepaid-discount/apply   — apply -₹30 to cart (Razorpay selected)
 * POST /store/prepaid-discount/remove  — remove the discount (COD selected / method changed)
 *
 * INTEGRITY NOTE (Risk 3 from integration plan):
 * The server validates provider_id before applying.  The storefront should also
 * call /remove when the user switches to COD.  But as a belt-and-suspenders
 * measure, the checkout-client also calls /remove unconditionally when COD is
 * confirmed, and the storefront's complete() call re-validates on the server.
 *
 * Discount is implemented as a line item adjustment (not a coupon code) so it
 * can't be manually entered by the customer.
 *
 * ADJUSTMENT KEY: "prepaid_discount" — used to find and remove the adjustment.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const PREPAID_DISCOUNT_PAISE = 3000; // ₹30 × 100
const ADJUSTMENT_KEY = "prepaid_discount";
// ── Apply ─────────────────────────────────────────────────────────────────────
async function POST(req, res) {
    const path = req.path || req.url || "";
    const isRemove = path.includes("/remove");
    if (isRemove) {
        return handleRemove(req, res);
    }
    return handleApply(req, res);
}
async function handleApply(req, res) {
    const { cart_id, provider_id } = req.body;
    if (!cart_id) {
        res.status(400).json({ error: "cart_id is required" });
        return;
    }
    // Server-side guard: only apply for prepaid (razorpay), never for COD.
    if (!provider_id || provider_id === "cod") {
        res.status(400).json({
            error: "Prepaid discount only applies to non-COD payment methods",
        });
        return;
    }
    try {
        const cartModuleService = req.scope.resolve(utils_1.Modules.CART);
        // Check if adjustment already exists (idempotent apply).
        const [cart] = await cartModuleService.listCarts({ id: [cart_id] }, {
            select: ["id"],
            relations: ["items", "items.adjustments"],
        });
        if (!cart) {
            res.status(404).json({ error: "cart_not_found" });
            return;
        }
        // Look for existing prepaid discount to avoid double-applying.
        const typedCart = cart;
        const alreadyApplied = typedCart.items?.some((item) => item.adjustments?.some((adj) => adj.code === ADJUSTMENT_KEY || adj.description === ADJUSTMENT_KEY));
        if (alreadyApplied) {
            res.status(200).json({ applied: true, already_existed: true });
            return;
        }
        // Apply the discount to the first line item as a negative adjustment.
        // Medusa v2 line item adjustments reduce the item total.
        const firstItem = typedCart.items?.[0];
        if (!firstItem) {
            res.status(400).json({ error: "cart_has_no_items" });
            return;
        }
        await cartModuleService.addLineItemAdjustments(cart_id, [
            {
                item_id: firstItem.id,
                amount: -PREPAID_DISCOUNT_PAISE,
                description: ADJUSTMENT_KEY,
                code: ADJUSTMENT_KEY,
            },
        ]);
        res.status(200).json({
            applied: true,
            discount_inr: 30,
            message: "₹30 prepaid discount applied",
        });
    }
    catch (err) {
        console.error("[prepaid-discount/apply] Error:", err);
        res.status(500).json({ error: "internal_error" });
    }
}
async function handleRemove(req, res) {
    const { cart_id } = req.body;
    if (!cart_id) {
        res.status(400).json({ error: "cart_id is required" });
        return;
    }
    try {
        const cartModuleService = req.scope.resolve(utils_1.Modules.CART);
        const [cart] = await cartModuleService.listCarts({ id: [cart_id] }, {
            select: ["id"],
            relations: ["items", "items.adjustments"],
        });
        if (!cart) {
            res.status(404).json({ error: "cart_not_found" });
            return;
        }
        const typedCart = cart;
        // Collect all adjustment IDs that match our key.
        const adjustmentIds = [];
        for (const item of typedCart.items ?? []) {
            for (const adj of item.adjustments ?? []) {
                if (adj.code === ADJUSTMENT_KEY || adj.description === ADJUSTMENT_KEY) {
                    adjustmentIds.push(adj.id);
                }
            }
        }
        if (adjustmentIds.length === 0) {
            res.status(200).json({ removed: false, reason: "no_discount_found" });
            return;
        }
        await cartModuleService.deleteLineItemAdjustments(adjustmentIds);
        res.status(200).json({
            removed: true,
            adjustments_removed: adjustmentIds.length,
        });
    }
    catch (err) {
        console.error("[prepaid-discount/remove] Error:", err);
        res.status(500).json({ error: "internal_error" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3ByZXBhaWQtZGlzY291bnQvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FrQkc7O0FBVUgsb0JBU0M7QUFoQkQscURBQW1EO0FBRW5ELE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFBLENBQUMsWUFBWTtBQUNoRCxNQUFNLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQTtBQUV6QyxpRkFBaUY7QUFFMUUsS0FBSyxVQUFVLElBQUksQ0FBQyxHQUFrQixFQUFFLEdBQW1CO0lBQ2hFLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUE7SUFDdEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQTtJQUV6QyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2IsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFBO0lBQy9CLENBQUM7SUFFRCxPQUFPLFdBQVcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUE7QUFDOUIsQ0FBQztBQUVELEtBQUssVUFBVSxXQUFXLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNoRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUdwQyxDQUFBO0lBRUQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFBO1FBQ3RELE9BQU07SUFDUixDQUFDO0lBRUQsdUVBQXVFO0lBQ3ZFLElBQUksQ0FBQyxXQUFXLElBQUksV0FBVyxLQUFLLEtBQUssRUFBRSxDQUFDO1FB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