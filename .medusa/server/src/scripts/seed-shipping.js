"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = seedShipping;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
// D-006 thresholds in paise
const FREE_SHIPPING_THRESHOLD_PAISE = 49900; // ₹499
const FLAT_SHIPPING_AMOUNT_PAISE = 5000; // ₹50
const FREE_SHIPPING_AMOUNT_PAISE = 0;
async function seedShipping({ container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    logger.info("Seeding shipping options (D-006 rules)...");
    // ── Find India region ─────────────────────────────────────────────────────
    const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "name", "currency_code"],
        filters: { currency_code: "inr" },
    });
    const indiaRegion = regions?.[0];
    if (!indiaRegion) {
        throw new Error("India region not found. Run `npm run seed:tpl` first to create the region.");
    }
    logger.info(`Found India region: ${indiaRegion.id}`);
    // ── Find fulfillment set ──────────────────────────────────────────────────
    const fulfillmentModuleService = container.resolve(utils_1.Modules.FULFILLMENT);
    const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets({ name: "India delivery" }, { relations: ["service_zones"] });
    const fulfillmentSet = fulfillmentSets?.[0];
    if (!fulfillmentSet) {
        throw new Error("Fulfillment set 'India delivery' not found. Run `npm run seed:tpl` first.");
    }
    const serviceZone = fulfillmentSet.service_zones?.[0];
    if (!serviceZone) {
        throw new Error("No service zone found in fulfillment set.");
    }
    logger.info(`Found service zone: ${serviceZone.id}`);
    // ── Find shipping profile ─────────────────────────────────────────────────
    const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({ type: "default" }, {});
    const shippingProfile = shippingProfiles?.[0];
    if (!shippingProfile) {
        throw new Error("Default shipping profile not found.");
    }
    // ── Remove existing shipping options (clean slate) ────────────────────────
    const existingOptions = await fulfillmentModuleService.listShippingOptions({ service_zone: { id: serviceZone.id } }, {});
    if (existingOptions.length > 0) {
        logger.info(`Removing ${existingOptions.length} existing shipping option(s)...`);
        await (0, core_flows_1.deleteShippingOptionsWorkflow)(container).run({
            input: { ids: existingOptions.map((o) => o.id) },
        });
    }
    // ── Create correct shipping options ───────────────────────────────────────
    logger.info("Creating shipping options with D-006 price rules...");
    await (0, core_flows_1.createShippingOptionsWorkflow)(container).run({
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
    });
    logger.info("Shipping options created successfully.");
    // ── Configure 18% GST tax rate ────────────────────────────────────────────
    // The tax region was created in seed-tpl.ts (createTaxRegionsWorkflow).
    // Here we set the actual rate on it.
    try {
        const taxModuleService = container.resolve(utils_1.Modules.TAX);
        const taxRegions = await taxModuleService.listTaxRegions({ country_code: "in" }, {});
        const taxRegion = taxRegions?.[0];
        if (!taxRegion) {
            logger.warn("India tax region not found — skipping GST rate creation.");
            logger.warn("Run seed-tpl.ts first, then re-run this script.");
        }
        else {
            // Check for existing rates to avoid duplicates
            const existingRates = await taxModuleService.listTaxRates({ tax_region_id: taxRegion.id }, {});
            const gstRateExists = existingRates.some((r) => r.name === "GST" || r.code === "GST");
            if (!gstRateExists) {
                await taxModuleService.createTaxRates([
                    {
                        tax_region_id: taxRegion.id,
                        name: "GST",
                        code: "GST",
                        rate: 18, // 18% GST — D-006 / GSTIN 29APFPH6495C1ZP
                    },
                ]);
                logger.info("Created 18% GST tax rate for India region.");
            }
            else {
                logger.info("GST tax rate already exists — skipping.");
            }
        }
    }
    catch (taxErr) {
        logger.warn(`Tax rate setup failed: ${taxErr.message}`);
        logger.warn("Tax rate can be set manually via Medusa admin API.");
    }
    logger.info("Shipping seed complete. Verify with: GET /store/shipping-options?cart_id=<test_cart_id>");
    logger.info(`Expected: cart < ₹499 → Standard Shipping ₹50 only. Cart >= ₹499 → Free Shipping only.`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VlZC1zaGlwcGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY3JpcHRzL3NlZWQtc2hpcHBpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHOztBQWNILCtCQWlOQztBQTVORCxxREFBOEU7QUFDOUUsNERBR29DO0FBRXBDLDRCQUE0QjtBQUM1QixNQUFNLDZCQUE2QixHQUFHLEtBQUssQ0FBQSxDQUFDLE9BQU87QUFDbkQsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUEsQ0FBSyxNQUFNO0FBQ2xELE1BQU0sMEJBQTBCLEdBQUcsQ0FBQyxDQUFBO0FBRXJCLEtBQUssVUFBVSxZQUFZLENBQUMsRUFBRSxTQUFTLEVBQVk7SUFDaEUsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtJQUNsRSxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLGlDQUF5QixDQUFDLEtBQUssQ0FBQyxDQUFBO0lBRWhFLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLENBQUMsQ0FBQTtJQUV4RCw2RUFBNkU7SUFDN0UsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDMUMsTUFBTSxFQUFFLFFBQVE7UUFDaEIsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxlQUFlLENBQUM7UUFDdkMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRTtLQUNsQyxDQUFDLENBQUE7SUFFRixNQUFNLFdBQVcsR0FBRyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNoQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDakIsTUFBTSxJQUFJLEtBQUssQ0FDYiw0RUFBNEUsQ0FDN0UsQ0FBQTtJQUNILENB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