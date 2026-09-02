"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = applyDrop1;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
const PLAN_PATH = path_1.default.join(__dirname, "..", "..", "..", "..", "artifacts", "phase-4", "catalog-curation", "drop1-plan.json");
const BATCH = 100;
const slugify = (s) => s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "");
async function applyDrop1({ container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const plan = JSON.parse(fs_1.default.readFileSync(PLAN_PATH, "utf8"));
    // --- 1. delete demo apparel ---
    const delIds = plan.delete.map((d) => d.id);
    if (delIds.length) {
        logger.info(`Deleting ${delIds.length} demo apparel products...`);
        await (0, core_flows_1.deleteProductsWorkflow)(container).run({ input: { ids: delIds } });
    }
    // --- 2. create Drop 1 collections (idempotent by handle) ---
    const collNames = Object.keys(plan.collection_counts);
    const { data: existingColls } = await query.graph({
        entity: "product_collection", fields: ["id", "title", "handle"],
    });
    const collIdByName = {};
    for (const c of existingColls) {
        const match = collNames.find((n) => slugify(n) === c.handle || n === c.title);
        if (match)
            collIdByName[match] = c.id;
    }
    const toCreate = collNames.filter((n) => !collIdByName[n]);
    if (toCreate.length) {
        logger.info(`Creating ${toCreate.length} collections: ${toCreate.join(", ")}`);
        const { result } = await (0, core_flows_1.createCollectionsWorkflow)(container).run({
            input: {
                collections: toCreate.map((name) => ({
                    title: name,
                    handle: slugify(name),
                    metadata: { drop: "1" },
                })),
            },
        });
        for (const c of result) {
            const match = collNames.find((n) => n === c.title);
            if (match)
                collIdByName[match] = c.id;
        }
    }
    // --- 3. set EVERYTHING to draft (backlog) ---
    const { data: allProducts } = await query.graph({ entity: "product", fields: ["id"] });
    const allIds = allProducts.map((p) => p.id);
    logger.info(`Setting ${allIds.length} products to draft...`);
    for (let i = 0; i < allIds.length; i += BATCH) {
        await (0, core_flows_1.updateProductsWorkflow)(container).run({
            input: { products: allIds.slice(i, i + BATCH).map((id) => ({ id, status: utils_1.ProductStatus.DRAFT })) },
        });
    }
    // --- 4. publish the Drop 1 winners (title + status + collection) ---
    const liveIds = new Set(allIds);
    const winners = plan.publish.filter((w) => liveIds.has(w.id));
    const skipped = plan.publish.filter((w) => !liveIds.has(w.id));
    if (skipped.length)
        logger.warn(`Skipping ${skipped.length} stale winner id(s): ${skipped.map((w) => w.clean).join(", ")}`);
    logger.info(`Publishing ${winners.length} Drop 1 winners...`);
    const updates = winners.map((w) => ({
        id: w.id,
        title: w.clean,
        status: utils_1.ProductStatus.PUBLISHED,
        collection_id: collIdByName[w.collection],
    }));
    for (let i = 0; i < updates.length; i += BATCH) {
        await (0, core_flows_1.updateProductsWorkflow)(container).run({ input: { products: updates.slice(i, i + BATCH) } });
        logger.info(`  published ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
    // --- report ---
    const { data: pub } = await query.graph({
        entity: "product", fields: ["id"], filters: { status: "published" },
    });
    logger.info(`Done. Published=${pub.length}. Collections: ${collNames.map((n) => `${n}(${plan.collection_counts[n]})`).join(", ")}`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHktZHJvcDEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NyaXB0cy9hcHBseS1kcm9wMS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQW1DQSw2QkF3RUM7QUExR0QscURBQW9GO0FBQ3BGLDREQUlvQztBQUNwQyw0Q0FBbUI7QUFDbkIsZ0RBQXVCO0FBRXZCOzs7Ozs7Ozs7R0FTRztBQUNILE1BQU0sU0FBUyxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQ3pCLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQ2pDLFdBQVcsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLENBQzlELENBQUE7QUFDRCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUE7QUFDakIsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUM1QixDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQTtBQVN0RyxLQUFLLFVBQVUsVUFBVSxDQUFDLEVBQUUsU0FBUyxFQUFZO0lBQzlELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDbEUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNoRSxNQUFNLElBQUksR0FBUyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQUUsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUE7SUFFakUsaUNBQWlDO0lBQ2pDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDM0MsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbEIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixDQUFDLENBQUE7UUFDakUsTUFBTSxJQUFBLG1DQUFzQixFQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUE7SUFDekUsQ0FBQztJQUVELDhEQUE4RDtJQUM5RCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO0lBQ3JELE1BQU0sRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ2hELE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQztLQUNoRSxDQUFDLENBQUE7SUFDRixNQUFNLFlBQVksR0FBMkIsRUFBRSxDQUFBO0lBQy9DLEtBQUssTUFBTSxDQUFDLElBQUksYUFBYSxFQUFFLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUM3RSxJQUFJLEtBQUs7WUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtJQUN2QyxDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUMxRCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNwQixNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksUUFBUSxDQUFDLE1BQU0saUJBQWlCLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBQzlFLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUEsc0NBQXlCLEVBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ2hFLEtBQUssRUFBRTtnQkFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDbkMsS0FBSyxFQUFFLElBQUk7b0JBQ1gsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ3JCLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUU7aUJBQ3hCLENBQUMsQ0FBQzthQUNKO1NBQ0YsQ0FBQyxDQUFBO1FBQ0YsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUN2QixNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQ2xELElBQUksS0FBSztnQkFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtRQUN2QyxDQUFDO0lBQ0gsQ0FBQztJQUVELCtDQUErQztJQUMvQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBQ3RGLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFpQixFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDM0QsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixDQUFDLENBQUE7SUFDNUQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQzlDLE1BQU0sSUFBQSxtQ0FBc0IsRUFBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDMUMsS0FBSyxFQUFFLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFVLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsTUFBTSxFQUFFLHFCQUFhLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFO1NBQzNHLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFFRCxzRUFBc0U7SUFDdEUsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFDN0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtJQUM5RCxJQUFJLE9BQU8sQ0FBQyxNQUFNO1FBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLE9BQU8sQ0FBQyxNQUFNLHdCQUF3QixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtJQUMzSCxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsT0FBTyxDQUFDLE1BQU0sb0JBQW9CLENBQUMsQ0FBQTtJQUM3RCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2xDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRTtRQUNSLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSztRQUNkLE1BQU0sRUFBRSxxQkFBYSxDQUFDLFNBQVM7UUFDL0IsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO0tBQzFDLENBQUMsQ0FBQyxDQUFBO0lBQ0gsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQy9DLE1BQU0sSUFBQSxtQ0FBc0IsRUFBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBQ2pHLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFBO0lBQ3JGLENBQUM7SUFFRCxpQkFBaUI7SUFDakIsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDdEMsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFTO0tBQzNFLENBQUMsQ0FBQTtJQUNGLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxNQUFNLGtCQUFrQixTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7QUFDckksQ0FBQyJ9