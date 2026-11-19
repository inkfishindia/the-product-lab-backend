"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = applyPdpCopy;
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/medusa/core-flows");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
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
const DESC_PATH = path_1.default.join(__dirname, "..", "..", "..", "..", "artifacts", "phase-4", "catalog-curation", "drop1-descriptions.json");
const BATCH = 50;
async function applyPdpCopy({ container }) {
    const logger = container.resolve(utils_1.ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const items = JSON.parse(fs_1.default.readFileSync(DESC_PATH, "utf8"));
    logger.info(`Loaded ${items.length} PDP descriptions from drop1-descriptions.json`);
    // confirm which ids actually exist in the catalog
    const { data: allProducts } = await query.graph({ entity: "product", fields: ["id"] });
    const liveIds = new Set(allProducts.map((p) => p.id));
    const apply = items.filter((x) => liveIds.has(x.id));
    const stale = items.filter((x) => !liveIds.has(x.id));
    if (stale.length)
        logger.warn(`Skipping ${stale.length} stale id(s): ${stale.map((s) => s.id).join(", ")}`);
    logger.info(`Writing descriptions to ${apply.length} products...`);
    for (let i = 0; i < apply.length; i += BATCH) {
        await (0, core_flows_1.updateProductsWorkflow)(container).run({
            input: { products: apply.slice(i, i + BATCH).map((x) => ({ id: x.id, description: x.description })) },
        });
        logger.info(`  updated ${Math.min(i + BATCH, apply.length)}/${apply.length}`);
    }
    // verify: count published products that now have a non-empty description
    const { data: pub } = await query.graph({
        entity: "product",
        fields: ["id", "description"],
        filters: { status: "published" },
    });
    const withDesc = pub.filter((p) => !!(p.description && p.description.trim().length > 0));
    logger.info(`Done. Published products with a description: ${withDesc.length}/${pub.length}.`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHktcGRwLWNvcHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NyaXB0cy9hcHBseS1wZHAtY29weS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQXdCQSwrQkErQkM7QUF0REQscURBQXFFO0FBQ3JFLDREQUFvRTtBQUNwRSw0Q0FBbUI7QUFDbkIsZ0RBQXVCO0FBRXZCOzs7Ozs7Ozs7R0FTRztBQUNILE1BQU0sU0FBUyxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQ3pCLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQ2pDLFdBQVcsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUseUJBQXlCLENBQ3RFLENBQUE7QUFDRCxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUE7QUFJRCxLQUFLLFVBQVUsWUFBWSxDQUFDLEVBQUUsU0FBUyxFQUFZO0lBQ2hFLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsaUNBQXlCLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDbEUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQ0FBeUIsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUNoRSxNQUFNLEtBQUssR0FBZSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQUUsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUE7SUFDeEUsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEtBQUssQ0FBQyxNQUFNLGdEQUFnRCxDQUFDLENBQUE7SUFFbkYsa0RBQWtEO0lBQ2xELE1BQU0sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDdEYsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBO0lBQ3JFLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFDcEQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFBO0lBQ3JELElBQUksS0FBSyxDQUFDLE1BQU07UUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksS0FBSyxDQUFDLE1BQU0saUJBQWlCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO0lBRTNHLE1BQU0sQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEtBQUssQ0FBQyxNQUFNLGNBQWMsQ0FBQyxDQUFBO0lBQ2xFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUM3QyxNQUFNLElBQUEsbUNBQXNCLEVBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQzFDLEtBQUssRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUU7U0FDdEcsQ0FBQyxDQUFBO1FBQ0YsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUE7SUFDL0UsQ0FBQztJQUVELHlFQUF5RTtJQUN6RSxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQztRQUN0QyxNQUFNLEVBQUUsU0FBUztRQUNqQixNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDO1FBQzdCLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQVM7S0FDeEMsQ0FBQyxDQUFBO0lBQ0YsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQWtDLEVBQUUsRUFBRSxDQUNqRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUNyRCxDQUFBO0lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxnREFBZ0QsUUFBUSxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQTtBQUMvRixDQUFDIn0=