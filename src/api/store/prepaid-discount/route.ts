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

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const PREPAID_DISCOUNT_PAISE = 3000 // ₹30 × 100
const ADJUSTMENT_KEY = "prepaid_discount"

// ── Apply ─────────────────────────────────────────────────────────────────────

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const path = req.path || req.url || ""
  const isRemove = path.includes("/remove")

  if (isRemove) {
    return handleRemove(req, res)
  }

  return handleApply(req, res)
}

async function handleApply(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id, provider_id } = req.body as {
    cart_id?: string
    provider_id?: string
  }

  if (!cart_id) {
    res.status(400).json({ error: "cart_id is required" })
    return
  }

  // Server-side guard: only apply for prepaid (razorpay), never for COD.
  if (!provider_id || provider_id === "cod") {
    res.status(400).json({
      error: "Prepaid discount only applies to non-COD payment methods",
    })
    return
  }

  try {
    const cartModuleService = req.scope.resolve(Modules.CART)

    // Check if adjustment already exists (idempotent apply).
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

    // Look for existing prepaid discount to avoid double-applying.
    const typedCart = cart as {
      items?: Array<{
        id: string
        adjustments?: Array<{ code?: string; description?: string }>
      }>
    }
    const alreadyApplied = typedCart.items?.some((item) =>
      item.adjustments?.some((adj) => adj.code === ADJUSTMENT_KEY || adj.description === ADJUSTMENT_KEY)
    )

    if (alreadyApplied) {
      res.status(200).json({ applied: true, already_existed: true })
      return
    }

    // Apply the discount to the first line item as a negative adjustment.
    // Medusa v2 line item adjustments reduce the item total.
    const firstItem = typedCart.items?.[0]
    if (!firstItem) {
      res.status(400).json({ error: "cart_has_no_items" })
      return
    }

    await cartModuleService.addLineItemAdjustments(cart_id, [
      {
        item_id: firstItem.id,
        amount: -PREPAID_DISCOUNT_PAISE,
        description: ADJUSTMENT_KEY,
        code: ADJUSTMENT_KEY,
      },
    ])

    res.status(200).json({
      applied: true,
      discount_inr: 30,
      message: "₹30 prepaid discount applied",
    })
  } catch (err) {
    console.error("[prepaid-discount/apply] Error:", err)
    res.status(500).json({ error: "internal_error" })
  }
}

async function handleRemove(req: MedusaRequest, res: MedusaResponse) {
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

    // Collect all adjustment IDs that match our key.
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
    console.error("[prepaid-discount/remove] Error:", err)
    res.status(500).json({ error: "internal_error" })
  }
}
