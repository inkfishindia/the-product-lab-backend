"use strict";
/**
 * POST /store/prepaid-discount-remove
 *
 * Removes the prepaid ₹30 discount from a cart.
 * Called when the customer switches from Razorpay to COD.
 * Also called by the storefront as a guard before COD order completion.
 *
 * This is a separate route file (not a sub-path of prepaid-discount) because
 * Medusa v2's file-based routing creates one handler per folder.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const utils_1 = require("@medusajs/framework/utils");
const ADJUSTMENT_KEY = "prepaid_discount";
async function POST(req, res) {
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
        console.error("[prepaid-discount-remove] Error:", err);
        res.status(500).json({ error: "internal_error" });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL3ByZXBhaWQtZGlzY291bnQtcmVtb3ZlL3JvdXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7O0dBU0c7O0FBT0gsb0JBc0RDO0FBMURELHFEQUFtRDtBQUVuRCxNQUFNLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQTtBQUVsQyxLQUFLLFVBQVUsSUFBSSxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDaEUsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUE0QixDQUFBO0lBRXBELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNiLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQTtRQUN0RCxPQUFNO0lBQ1IsQ0FBQztJQUVELElBQUksQ0FBQztRQUNILE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRXpELE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLGlCQUFpQixDQUFDLFNBQVMsQ0FDOUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUNqQjtZQUNFLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQztZQUNkLFNBQVMsRUFBRSxDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQztTQUMxQyxDQUNGLENBQUE7UUFFRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDVixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUE7WUFDakQsT0FBTTtRQUNSLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxJQUlqQixDQUFBO1FBRUQsTUFBTSxhQUFhLEdBQWEsRUFBRSxDQUFBO1FBQ2xDLEtBQUssTUFBTSxJQUFJLElBQUksU0FBUyxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUN6QyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxXQUFXLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ3pDLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxjQUFjLElBQUksR0FBRyxDQUFDLFdBQVcsS0FBSyxjQUFjLEVBQUUsQ0FBQztvQkFDdEUsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUE7Z0JBQzVCLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUVELElBQUksYUFBYSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMvQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQTtZQUNyRSxPQUFNO1FBQ1IsQ0FBQztRQUVELE1BQU0saUJBQWlCLENBQUMseUJBQXlCLENBQUMsYUFBYSxDQUFDLENBQUE7UUFFaEUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsT0FBTyxFQUFFLElBQUk7WUFDYixtQkFBbUIsRUFBRSxhQUFhLENBQUMsTUFBTTtTQUMxQyxDQUFDLENBQUE7SUFDSixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFDdEQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFBO0lBQ25ELENBQUM7QUFDSCxDQUFDIn0=