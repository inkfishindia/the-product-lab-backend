import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  updateProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import fs from "fs"
import path from "path"

/**
 * Drop 1 curation apply (D-028). Consumes drop1-plan.json produced by
 * curate-drop1.py and brings the Medusa catalog to the curated launch state:
 *   1. delete Medusa demo apparel (D-011 junk)
 *   2. create the Drop 1 collections (idempotent by handle)
 *   3. set EVERY product to draft (backlog)
 *   4. publish the 67 Drop 1 winners with cleaned titles + collection
 *
 * Run: npx medusa exec ./src/scripts/apply-drop1.ts
 */
const PLAN_PATH = path.join(
  __dirname, "..", "..", "..", "..",
  "artifacts", "phase-4", "catalog-curation", "drop1-plan.json"
)
const BATCH = 100
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "")

type PubItem = { id: string; clean: string; collection: string }
type Plan = {
  publish: PubItem[]
  delete: { id: string; title: string }[]
  collection_counts: Record<string, number>
}

export default async function applyDrop1({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const plan: Plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"))

  // --- 1. delete demo apparel ---
  const delIds = plan.delete.map((d) => d.id)
  if (delIds.length) {
    logger.info(`Deleting ${delIds.length} demo apparel products...`)
    await deleteProductsWorkflow(container).run({ input: { ids: delIds } })
  }

  // --- 2. create Drop 1 collections (idempotent by handle) ---
  const collNames = Object.keys(plan.collection_counts)
  const { data: existingColls } = await query.graph({
    entity: "product_collection", fields: ["id", "title", "handle"],
  })
  const collIdByName: Record<string, string> = {}
  for (const c of existingColls) {
    const match = collNames.find((n) => slugify(n) === c.handle || n === c.title)
    if (match) collIdByName[match] = c.id
  }
  const toCreate = collNames.filter((n) => !collIdByName[n])
  if (toCreate.length) {
    logger.info(`Creating ${toCreate.length} collections: ${toCreate.join(", ")}`)
    const { result } = await createCollectionsWorkflow(container).run({
      input: {
        collections: toCreate.map((name) => ({
          title: name,
          handle: slugify(name),
          metadata: { drop: "1" },
        })),
      },
    })
    for (const c of result) {
      const match = collNames.find((n) => n === c.title)
      if (match) collIdByName[match] = c.id
    }
  }

  // --- 3. set EVERYTHING to draft (backlog) ---
  const { data: allProducts } = await query.graph({ entity: "product", fields: ["id"] })
  const allIds = allProducts.map((p: { id: string }) => p.id)
  logger.info(`Setting ${allIds.length} products to draft...`)
  for (let i = 0; i < allIds.length; i += BATCH) {
    await updateProductsWorkflow(container).run({
      input: { products: allIds.slice(i, i + BATCH).map((id: string) => ({ id, status: ProductStatus.DRAFT })) },
    })
  }

  // --- 4. publish the Drop 1 winners (title + status + collection) ---
  const liveIds = new Set(allIds)
  const winners = plan.publish.filter((w) => liveIds.has(w.id))
  const skipped = plan.publish.filter((w) => !liveIds.has(w.id))
  if (skipped.length) logger.warn(`Skipping ${skipped.length} stale winner id(s): ${skipped.map((w) => w.clean).join(", ")}`)
  logger.info(`Publishing ${winners.length} Drop 1 winners...`)
  const updates = winners.map((w) => ({
    id: w.id,
    title: w.clean,
    status: ProductStatus.PUBLISHED,
    collection_id: collIdByName[w.collection],
  }))
  for (let i = 0; i < updates.length; i += BATCH) {
    await updateProductsWorkflow(container).run({ input: { products: updates.slice(i, i + BATCH) } })
    logger.info(`  published ${Math.min(i + BATCH, updates.length)}/${updates.length}`)
  }

  // --- report ---
  const { data: pub } = await query.graph({
    entity: "product", fields: ["id"], filters: { status: "published" } as any,
  })
  logger.info(`Done. Published=${pub.length}. Collections: ${collNames.map((n) => `${n}(${plan.collection_counts[n]})`).join(", ")}`)
}
