import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import fs from "fs"
import path from "path"

type WooProduct = {
  handle: string
  sku: string
  title: string
  category: string
  tags: string[]
  description: string
  price: number
  images: string[]
  stock: number
  type: string
}

const CATALOG_PATH = path.join(__dirname, "import-catalog.json")
const BATCH_SIZE = 100

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "")

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
export default async function importWoo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)

  let products: WooProduct[] = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"))

  const onlyCat = process.env.IMPORT_CATEGORY
  if (onlyCat) products = products.filter((p) => p.category === onlyCat)
  const limit = process.env.IMPORT_LIMIT ? parseInt(process.env.IMPORT_LIMIT, 10) : 0
  if (limit > 0) products = products.slice(0, limit)

  logger.info(`Importing ${products.length} products${onlyCat ? ` (category=${onlyCat})` : ""}${limit ? ` (limit=${limit})` : ""}`)

  // --- Resolve existing infra (seeded by seed-tpl.ts) ---
  const [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannel) throw new Error("No 'Default Sales Channel' found. Run `npm run seed:tpl` first.")

  const [shippingProfile] = await fulfillmentModuleService.listShippingProfiles({ type: "default" })
  if (!shippingProfile) throw new Error("No default shipping profile found. Run `npm run seed:tpl` first.")

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  })
  if (!stockLocations.length) throw new Error("No stock location found. Run `npm run seed:tpl` first.")
  const stockLocationId = stockLocations[0].id

  // --- Optionally wipe existing products for a clean catalog ---
  if (process.env.KEEP_EXISTING !== "1") {
    const { data: existing } = await query.graph({ entity: "product", fields: ["id"] })
    if (existing.length) {
      logger.info(`Deleting ${existing.length} existing products...`)
      await deleteProductsWorkflow(container).run({ input: { ids: existing.map((p: { id: string }) => p.id) } })
    }
  }

  // --- Ensure categories exist (reuse existing by slug, create missing) ---
  // Match on slug, not name: WooCommerce "Fridge magnets" vs existing
  // "Fridge Magnets" share a handle and would collide on create.
  const neededCats = [...new Set(products.map((p) => p.category))]
  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
  })
  const catBySlug: Record<string, string> = {}
  for (const c of existingCats) catBySlug[slugify(c.name)] = c.id

  const missing = neededCats.filter((c) => !catBySlug[slugify(c)])
  if (missing.length) {
    logger.info(`Creating ${missing.length} categories: ${missing.join(", ")}`)
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: missing.map((name) => ({ name, is_active: true })) },
    })
    for (const c of result) catBySlug[slugify(c.name)] = c.id
  }
  const categoryIdFor = (cat: string) => catBySlug[slugify(cat)]

  // --- Import products in batches ---
  let imported = 0
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    await createProductsWorkflow(container).run({
      input: {
        products: batch.map((p) => ({
          title: p.title,
          handle: p.handle,
          description: p.description || undefined,
          category_ids: categoryIdFor(p.category) ? [categoryIdFor(p.category)] : [],
          status: ProductStatus.PUBLISHED,
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
    })
    imported += batch.length
    logger.info(`  imported ${imported}/${products.length}`)
  }

  // --- Set inventory levels for any items that don't have one yet ---
  logger.info("Setting inventory levels...")
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "location_levels.id"],
  })
  const needLevels = inventoryItems.filter((it: { location_levels?: unknown[] | null }) => !it.location_levels?.length)
  if (needLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: needLevels.map((it: { id: string }) => ({
          location_id: stockLocationId,
          inventory_item_id: it.id,
          stocked_quantity: 100,
        })),
      },
    })
  }

  logger.info(`Import complete. ${imported} products imported, ${needLevels.length} inventory levels set.`)
}
