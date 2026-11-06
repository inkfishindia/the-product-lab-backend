"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = importWoo;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CATALOG_PATH = path_1.default.join(__dirname, "import-catalog.json");
const BATCH_SIZE = 100;
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "");
/**
 * Step 2 of the WooCommerce -> Medusa import.
 *
 * Reads import-catalog.json (produced by prep-woo-catalog.py), reuses the store
 * infrastructure already seeded by seed-tpl.ts (region, sales channel, stock
 * location, shipping profile), wipes existing products for a clean catalog,
 * creates any missing categories, and imports in batches.
 *
 * Env knobs (optional):
 *   IMPORT_CATEGORY="Earrings"   only import one category (slice test)
 *   IMPORT_LIMIT="20"            cap number of products (slice test)
 *   KEEP_EXISTING="1"            skip the wipe of existing products
 */
async function importWoo({ container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const fulfillmentModuleService = container.resolve(utils_1.Modules.FULFILLMENT);
    const salesChannelModuleService = container.resolve(utils_1.Modules.SALES_CHANNEL);
    let products = JSON.parse(fs_1.default.readFileSync(CATALOG_PATH, "utf8"));
    const onlyCat = process.env.IMPORT_CATEGORY;
    if (onlyCat)
        products = products.filter((p) => p.category === onlyCat);
    const limit = process.env.IMPORT_LIMIT ? parseInt(process.env.IMPORT_LIMIT, 10) : 0;
    if (limit > 0)
        products = products.slice(0, limit);
    logger.info(`Importing ${products.length} products${onlyCat ? ` (category=${onlyCat})` : ""}${limit ? ` (limit=${limit})` : ""}`);
    // --- Resolve existing infra (seeded by seed-tpl.ts) ---
    const [salesChannel] = await salesChannelModuleService.listSalesChannels({
        name: "Default Sales Channel",
    });
    if (!salesChannel)
        throw new Error("No 'Default Sales Channel' found. Run `npm run seed:tpl` first.");
    const [shippingProfile] = await fulfillmentModuleService.listShippingProfiles({ type: "default" });
    if (!shippingProfile)
        throw new Error("No default shipping profile found. Run `npm run seed:tpl` first.");
    const { data: stockLocations } = await query.graph({
        entity: "stock_location",
        fields: ["id"],
    });
    if (!stockLocations.length)
        throw new Error("No stock location found. Run `npm run seed:tpl` first.");
    const stockLocationId = stockLocations[0].id;
    // --- Optionally wipe existing products for a clean catalog ---
    if (process.env.KEEP_EXISTING !== "1") {
        const { data: existing } = await query.graph({ entity: "product", fields: ["id"] });
        if (existing.length) {
            logger.info(`Deleting ${existing.length} existing products...`);
            await (0, core_flows_1.deleteProductsWorkflow)(container).run({ input: { ids: existing.map((p) => p.id) } });
        }
    }
    // --- Ensure categories exist (reuse existing by slug, create missing) ---
    // Match on slug, not name: WooCommerce "Fridge magnets" vs existing
    // "Fridge Magnets" share a handle and would collide on create.
    const neededCats = [...new Set(products.map((p) => p.category))];
    const { data: existingCats } = await query.graph({
        entity: "product_category",
        fields: ["id", "name"],
    });
    const catBySlug = {};
    for (const c of existingCats)
        catBySlug[slugify(c.name)] = c.id;
    const missing = neededCats.filter((c) => !catBySlug[slugify(c)]);
    if (missing.length) {
        logger.info(`Creating ${missing.length} categories: ${missing.join(", ")}`);
        const { result } = await (0, core_flows_1.createProductCategoriesWorkflow)(container).run({
            input: { product_categories: missing.map((name) => ({ name, is_active: true })) },
        });
        for (const c of result)
            catBySlug[slugify(c.name)] = c.id;
    }
    const categoryIdFor = (cat) => catBySlug[slugify(cat)];
    // --- Import products in batches ---
    let imported = 0;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        await (0, core_flows_1.createProductsWorkflow)(container).run({
            input: {
                products: batch.map((p) => ({
                    title: p.title,
                    handle: p.handle,
                    description: p.description || undefined,
                    category_ids: categoryIdFor(p.category) ? [categoryIdFor(p.category)] : [],
                    status: utils_1.ProductStatus.PUBLISHED,
                    weight: 50,
                    shipping_profile_id: shippingProfile.id,
                    ...(p.images.length ? { images: p.images.map((url) => ({ url })) } : {}),
                    ...(p.images.length ? { thumbnail: p.images[0] } : {}),
                    options: [{ title: "Default", values: ["One Size"] }],
                    variants: [
                        {
                            title: "One Size",
                            sku: p.sku,
                            options: { Default: "One Size" },
                            manage_inventory: true,
                            prices: [{ amount: Math.round(p.price * 100), currency_code: "inr" }],
                        },
                    ],
                    sales_channels: [{ id: salesChannel.id }],
                })),
            },
        });
        imported += batch.length;
        logger.info(`  imported ${imported}/${products.length}`);
    }
    // --- Set inventory levels for any items that don't have one yet ---
    logger.info("Setting inventory levels...");
    const { data: inventoryItems } = await query.graph({
        entity: "inventory_item",
        fields: ["id", "location_levels.id"],
    });
    const needLevels = inventoryItems.filter((it) => !it.location_levels?.length);
    if (needLevels.length) {
        await (0, core_flows_1.createInventoryLevelsWorkflow)(container).run({
            input: {
                inventory_levels: needLevels.map((it) => ({
                    location_id: stockLocationId,
                    inventory_item_id: it.id,
                    stocked_quantity: 100,
                })),
            },
        });
    }
    logger.info(`Import complete. ${imported} products imported, ${needLevels.length} inventory levels set.`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wb3J0LXdvby5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY3JpcHRzL2ltcG9ydC13b28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUErQ0EsNEJBbUhDO0FBaktELHFEQUlrQztBQUNsQyw0REFLb0M7QUFDcEMsNENBQW1CO0FBQ25CLGdEQUF1QjtBQWV2QixNQUFNLFlBQVksR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO0FBQ2hFLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQTtBQUV0QixNQUFNLE9BQU8sR0FBRyxDQUFDLENBQVMsRUFBRSxFQUFFLENBQzVCLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQTtBQUVoRzs7Ozs7Ozs7Ozs7O0dBWUc7QUFDWSxLQUFLLFVBQVUsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFZO0lBQzdELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDbEUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNoRSxNQUFNLHdCQUF3QixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLFdBQVcsQ0FBQyxDQUFBO0lBQ3ZFLE1BQU0seUJBQXlCLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsYUFBYSxDQUFDLENBQUE7SUFFMUUsSUFBSSxRQUFRLEdBQWlCLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBRSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQTtJQUU5RSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQTtJQUMzQyxJQUFJLE9BQU87UUFBRSxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQTtJQUN0RSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDbkYsSUFBSSxLQUFLLEdBQUcsQ0FBQztRQUFFLFFBQVEsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUVsRCxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsUUFBUSxDQUFDLE1BQU0sWUFBWSxPQUFPLENBQUMsQ0FBQyxDQUFDLGNBQWMsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLFdBQVcsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUE7SUFFakkseURBQXlEO0lBQ3pELE1BQU0sQ0FBQyxZQUFZLENBQUMsR0FBRyxNQUFNLHlCQUF5QixDQUFDLGlCQUFpQixDQUFDO1FBQ3ZFLElBQUksRUFBRSx1QkFBdUI7S0FDOUIsQ0FBQyxDQUFBO0lBQ0YsSUFBSSxDQUFDLFlBQVk7UUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLGlFQUFpRSxDQUFDLENBQUE7SUFFckcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHLE1BQU0sd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQTtJQUNsRyxJQUFJLENBQUMsZUFBZTtRQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsa0VBQWtFLENBQUMsQ0FBQTtJQUV6RyxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztRQUNqRCxNQUFNLEVBQUUsZ0JBQWdCO1FBQ3hCLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQztLQUNmLENBQUMsQ0FBQTtJQUNGLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTTtRQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsd0RBQXdELENBQUMsQ0FBQTtJQUNyRyxNQUFNLGVBQWUsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBRTVDLGdFQUFnRTtJQUNoRSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDbkYsSUFBSSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLFFBQVEsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLENBQUE7WUFDL0QsTUFBTSxJQUFBLG1DQUFzQixFQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQzVHLENBQUM7SUFDSCxDQUFDO0lBRUQsMkVBQTJFO0lBQzNFLG9FQUFvRTtJQUNwRSwrREFBK0Q7SUFDL0QsTUFBTSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDaEUsTUFBTSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0MsTUFBTSxFQUFFLGtCQUFrQjtRQUMxQixNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO0tBQ3ZCLENBQUMsQ0FBQTtJQUNGLE1BQU0sU0FBUyxHQUEyQixFQUFFLENBQUE7SUFDNUMsS0FBSyxNQUFNLENBQUMsSUFBSSxZQUFZO1FBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBRS9ELE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDaEUsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbkIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLE9BQU8sQ0FBQyxNQUFNLGdCQUFnQixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUMzRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxJQUFBLDRDQUErQixFQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUN0RSxLQUFLLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUU7U0FDbEYsQ0FBQyxDQUFBO1FBQ0YsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNO1lBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFBO0lBQzNELENBQUM7SUFDRCxNQUFNLGFBQWEsR0FBRyxDQUFDLEdBQVcsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO0lBRTlELHFDQUFxQztJQUNyQyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUE7SUFDaEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ3JELE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQTtRQUMvQyxNQUFNLElBQUEsbUNBQXNCLEVBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQzFDLEtBQUssRUFBRTtnQkFDTCxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDMUIsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO29CQUNkLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTTtvQkFDaEIsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksU0FBUztvQkFDdkMsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUMxRSxNQUFNLEVBQUUscUJBQWEsQ0FBQyxTQUFTO29CQUMvQixNQUFNLEVBQUUsRUFBRTtvQkFDVixtQkFBbUIsRUFBRSxlQUFlLENBQUMsRUFBRTtvQkFDdkMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3hFLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3RELE9BQU8sRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUNyRCxRQUFRLEVBQUU7d0JBQ1I7NEJBQ0UsS0FBSyxFQUFFLFVBQVU7NEJBQ2pCLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRzs0QkFDVixPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFOzRCQUNoQyxnQkFBZ0IsRUFBRSxJQUFJOzRCQUN0QixNQUFNLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDO3lCQUN0RTtxQkFDRjtvQkFDRCxjQUFjLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxZQUFZLENBQUMsRUFBRSxFQUFFLENBQUM7aUJBQzFDLENBQUMsQ0FBQzthQUNKO1NBQ0YsQ0FBQyxDQUFBO1FBQ0YsUUFBUSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUE7UUFDeEIsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQTtJQUMxRCxDQUFDO0lBRUQscUVBQXFFO0lBQ3JFLE1BQU0sQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQTtJQUMxQyxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztRQUNqRCxNQUFNLEVBQUUsZ0JBQWdCO1FBQ3hCLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxvQkFBb0IsQ0FBQztLQUNyQyxDQUFDLENBQUE7SUFDRixNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBMEMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFBO0lBQ3JILElBQUksVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3RCLE1BQU0sSUFBQSwwQ0FBNkIsRUFBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDakQsS0FBSyxFQUFFO2dCQUNMLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFrQixFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUN4RCxXQUFXLEVBQUUsZUFBZTtvQkFDNUIsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLEVBQUU7b0JBQ3hCLGdCQUFnQixFQUFFLEdBQUc7aUJBQ3RCLENBQUMsQ0FBQzthQUNKO1NBQ0YsQ0FBQyxDQUFBO0lBQ0osQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLFFBQVEsdUJBQXVCLFVBQVUsQ0FBQyxNQUFNLHdCQUF3QixDQUFDLENBQUE7QUFDM0csQ0FBQyJ9