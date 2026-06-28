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

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const ADJUSTMENT_KEY = "prepaid_discount"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id } = req.body as { cart_id?: string }

  if (!cart_id) {
    res.status(400).json({ error: "cart_id is required" })
    return
  }

  try {
    const cartModuleService = req.scope.resolve(Modules.CART)

    const [cart] = await cartModuleService.listCarts(
      { id: [cart_id] },
      {
        select: ["id"],
        relations: ["items", "items.adjustments"],
      }
    )

    if (!cart) {
      res.status(404).json({ error: "cart_not_found" })
      return
    }

    const typedCart = cart as {
      items?: Array<{
        adjustments?: Array<{ id: string; code?: string; description?: string }>
      }>
    }

    const adjustmentIds: string[] = []
    for (const item of typedCart.items ?? []) {
      for (const adj of item.adjustments ?? []) {
        if (adj.code === ADJUSTMENT_KEY || adj.description === ADJUSTMENT_KEY) {
          adjustmentIds.push(adj.id)
        }
      }
    }

    if (adjustmentIds.length === 0) {
      res.status(200).json({ removed: false, reason: "no_discount_found" })
      return
    }

    await cartModuleService.deleteLineItemAdjustments(adjustmentIds)

    res.status(200).json({
      removed: true,
      adjustments_removed: adjustmentIds.length,
    })
  } catch (err) {
    console.error("[prepaid-discount-remove] Error:", err)
    res.status(500).json({ error: "internal_error" })
  }
}
