/**
 * seed-shipping.ts — Shipping Options + Tax Rate Setup
 *
 * Run with: npm run seed:shipping
 *
 * What this does:
 * 1. Finds the India region and fulfillment set created by seed-tpl.ts.
 * 2. Removes any existing incorrectly-configured shipping options.
 * 3. Creates two correctly-configured shipping options enforcing D-006:
 *    - Standard Shipping ₹50 (5000 paise) — carts below ₹499 (49900 paise)
 *    - Free Shipping ₹0  — carts ₹499 and above
 * 4. Configures the 18% GST tax rate for the India tax region.
 *
 * D-006 shipping rules:
 *   - Free shipping: order total >= ₹499
 *   - Flat ₹50:     order total ₹299–₹498
 *   - (Sub-₹299 orders: flat ₹50 applies — COD min is ₹299 but prepaid has no min)
 *
 * NOTE: Medusa v2.15.x shipping option price rules use `cart_subtotal` as the
 * condition attribute.  The subtotal is the item total BEFORE shipping and tax.
 * The free-shipping threshold in D-006 says "₹499" which in context means
 * the cart subtotal (item total).  This is the correct interpretation — if
 * a customer has ₹499 of items, shipping is free.
 *
 * IMPORTANT: Run this AFTER seed-tpl.ts has created the region and fulfillment set.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

// D-006 thresholds in paise
const FREE_SHIPPING_THRESHOLD_PAISE = 49900 // ₹499
const FLAT_SHIPPING_AMOUNT_PAISE = 5000     // ₹50
const FREE_SHIPPING_AMOUNT_PAISE = 0

export default async function seedShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("Seeding shipping options (D-006 rules)...")

  // ── Find India region ─────────────────────────────────────────────────────
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
    filters: { currency_code: "inr" },
  })

  const indiaRegion = regions?.[0]
  if (!indiaRegion) {
    throw new Error(
      "India region not found. Run `npm run seed:tpl` first to create the region."
    )
  }

  logger.info(`Found India region: ${indiaRegion.id}`)

  // ── Find fulfillment set ──────────────────────────────────────────────────
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets(
    { name: "India delivery" },
    { relations: ["service_zones"] }
  )

  const fulfillmentSet = fulfillmentSets?.[0]
  if (!fulfillmentSet) {
    throw new Error(
      "Fulfillment set 'India delivery' not found. Run `npm run seed:tpl` first."
    )
  }

  const serviceZone = fulfillmentSet.service_zones?.[0]
  if (!serviceZone) {
    throw new Error("No service zone found in fulfillment set.")
  }

  logger.info(`Found service zone: ${serviceZone.id}`)

  // ── Find shipping profile ─────────────────────────────────────────────────
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles(
    { type: "default" },
    {}
  )

  const shippingProfile = shippingProfiles?.[0]
  if (!shippingProfile) {
    throw new Error("Default shipping profile not found.")
  }

  // ── Remove existing shipping options (clean slate) ────────────────────────
  const existingOptions = await fulfillmentModuleService.listShippingOptions(
    { service_zone: { id: serviceZone.id } },
    {}
  )

  if (existingOptions.length > 0) {
    logger.info(`Removing ${existingOptions.length} existing shipping option(s)...`)
    await deleteShippingOptionsWorkflow(container).run({
      input: { ids: existingOptions.map((o) => o.id) },
    })
  }

  // ── Create correct shipping options ───────────────────────────────────────
  logger.info("Creating shipping options with D-006 price rules...")

  await createShippingOptionsWorkflow(container).run({
    input: [
      // Option 1: Standard Shipping ₹50 — for carts below ₹499
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivered in 3-5 business days via Shiprocket.",
          code: "standard",
        },
        prices: [
          {
            currency_code: "inr",
            amount: FLAT_SHIPPING_AMOUNT_PAISE,
            region_id: indiaRegion.id,
          },
        ],
        // NOTE on price rules: Medusa v2 shipping option rules filter which options
        // are RETURNED by the API, not which price applies.  The `cart_subtotal`
        // rule means this option is only offered when the condition is met.
        // Medusa v2.15.x rule attributes: cart_subtotal, enabled_in_store, is_return.
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
          // Show Standard Shipping only when subtotal < ₹499
          {
            attribute: "cart_subtotal",
            value: String(FREE_SHIPPING_THRESHOLD_PAISE),
            operator: "lt",
          },
        ],
      },
      // Option 2: Free Shipping — for carts ₹499 and above
      {
        name: "Free Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Free",
          description: "Free shipping on orders ₹499 and above.",
          code: "free",
        },
        prices: [
          {
            currency_code: "inr",
            amount: FREE_SHIPPING_AMOUNT_PAISE,
            region_id: indiaRegion.id,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
          // Show Free Shipping only when subtotal >= ₹499
          {
            attribute: "cart_subtotal",
            value: String(FREE_SHIPPING_THRESHOLD_PAISE),
            operator: "gte",
          },
        ],
      },
    ],
  })

  logger.info("Shipping options created successfully.")

  // ── Configure 18% GST tax rate ────────────────────────────────────────────
  // The tax region was created in seed-tpl.ts (createTaxRegionsWorkflow).
  // Here we set the actual rate on it.

  try {
    const taxModuleService = container.resolve(Modules.TAX)

    const taxRegions = await taxModuleService.listTaxRegions(
      { country_code: "in" },
      {}
    )

    const taxRegion = taxRegions?.[0]
    if (!taxRegion) {
      logger.warn("India tax region not found — skipping GST rate creation.")
      logger.warn("Run seed-tpl.ts first, then re-run this script.")
    } else {
      // Check for existing rates to avoid duplicates
      const existingRates = await taxModuleService.listTaxRates(
        { tax_region_id: taxRegion.id },
        {}
      )

      const gstRateExists = existingRates.some(
        (r) => r.name === "GST" || r.code === "GST"
      )

      if (!gstRateExists) {
        await taxModuleService.createTaxRates([
          {
            tax_region_id: taxRegion.id,
            name: "GST",
            code: "GST",
            rate: 18, // 18% GST — D-006 / GSTIN 29APFPH6495C1ZP
          },
        ])
        logger.info("Created 18% GST tax rate for India region.")
      } else {
        logger.info("GST tax rate already exists — skipping.")
      }
    }
  } catch (taxErr) {
    logger.warn(`Tax rate setup failed: ${(taxErr as Error).message}`)
    logger.warn("Tax rate can be set manually via Medusa admin API.")
  }

  logger.info(
    "Shipping seed complete. Verify with: GET /store/shipping-options?cart_id=<test_cart_id>"
  )
  logger.info(
    `Expected: cart < ₹499 → Standard Shipping ₹50 only. Cart >= ₹499 → Free Shipping only.`
  )
}
