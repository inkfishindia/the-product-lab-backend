import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import fs from "fs"
import path from "path"

/**
 * Apply Drop 1 PDP descriptions. Consumes drop1-descriptions.json
 * (Joanna's brand-voice PDP copy, specs grounded by Andy) and writes the
 * `description` field on the 67 published Drop 1 products.
 *
 * Idempotent: re-running just re-sets the same descriptions. Only touches
 * products whose id is present and live; stale ids are reported, not failed.
 *
 * Run: npx medusa exec ./src/scripts/apply-pdp-copy.ts
 */
const DESC_PATH = path.join(
  __dirname, "..", "..", "..", "..",
  "artifacts", "phase-4", "catalog-curation", "drop1-descriptions.json"
)
const BATCH = 50

type DescItem = { id: string; description: string }

export default async function applyPdpCopy({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const items: DescItem[] = JSON.parse(fs.readFileSync(DESC_PATH, "utf8"))
  logger.info(`Loaded ${items.length} PDP descriptions from drop1-descriptions.json`)

  // confirm which ids actually exist in the catalog
  const { data: allProducts } = await query.graph({ entity: "product", fields: ["id"] })
  const liveIds = new Set(allProducts.map((p: { id: string }) => p.id))
  const apply = items.filter((x) => liveIds.has(x.id))
  const stale = items.filter((x) => !liveIds.has(x.id))
  if (stale.length) logger.warn(`Skipping ${stale.length} stale id(s): ${stale.map((s) => s.id).join(", ")}`)

  logger.info(`Writing descriptions to ${apply.length} products...`)
  for (let i = 0; i < apply.length; i += BATCH) {
    await updateProductsWorkflow(container).run({
      input: { products: apply.slice(i, i + BATCH).map((x) => ({ id: x.id, description: x.description })) },
    })
    logger.info(`  updated ${Math.min(i + BATCH, apply.length)}/${apply.length}`)
  }

  // verify: count published products that now have a non-empty description
  const { data: pub } = await query.graph({
    entity: "product",
    fields: ["id", "description"],
    filters: { status: "published" } as any,
  })
  const withDesc = pub.filter((p: { description?: string | null }) =>
    !!(p.description && p.description.trim().length > 0)
  )
  logger.info(`Done. Published products with a description: ${withDesc.length}/${pub.length}.`)
}
