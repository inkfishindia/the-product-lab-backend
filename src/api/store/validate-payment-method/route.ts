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

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const COD_MINIMUM_PAISE = 29900 // ₹299 × 100

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id, provider_id } = req.body as {
    cart_id?: string
    provider_id?: string
  }

  if (!cart_id || !provider_id) {
    res.status(400).json({ valid: false, reason: "cart_id and provider_id are required" })
    return
  }

  if (provider_id !== "cod") {
    // Non-COD payment methods have no minimum enforced here.
    res.status(200).json({ valid: true })
    return
  }

  try {
    const cartModuleService = req.scope.resolve(Modules.CART)
    const [cart] = await cartModuleService.listCarts(
      { id: [cart_id] },
      { select: ["id", "total", "item_total", "shipping_total", "tax_total"] }
    )

    if (!cart) {
      res.status(400).json({ valid: false, reason: "cart_not_found" })
      return
    }

    // Medusa stores totals in paise (smallest currency unit for INR).
    // `total` includes shipping + tax.
    const cartTotal = (cart as { total?: number }).total ?? 0

    if (cartTotal < COD_MINIMUM_PAISE) {
      res.status(400).json({
        valid: false,
        reason: `COD is only available on orders of ₹299 or more. Your cart total is ₹${Math.round(cartTotal / 100)}.`,
        minimum_inr: 299,
        cart_total_inr: Math.round(cartTotal / 100),
      })
      return
    }

    res.status(200).json({ valid: true })
  } catch (err) {
    console.error("[validate-payment-method] Error:", err)
    res.status(500).json({ valid: false, reason: "internal_error" })
  }
}
