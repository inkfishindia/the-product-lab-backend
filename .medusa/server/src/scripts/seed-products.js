"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
// Path to the cleaned catalog JSON generated earlier
const catalogPath = "/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/cleaned_catalog.json";
// Load the JSON
const raw = JSON.parse(fs_1.default.readFileSync(catalogPath, "utf8"));
// Helper to generate a simple slug
function slugify(str) {
    return str
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/(\s|_)/g, "-")
        .replace(/--+/g, "-")
        .replace(/^-+|-+$/g, "");
}
// Transform each product to Medusa format
const products = raw.map((p) => ({
    sku: p.sku,
    title: p.name || p.title || p.sku,
    description: [p.short_description, p.description].filter(Boolean).join(" ") || "Product description not available",
    category_id: 1, // assume default category exists; adjust as needed
    tags: p.tags || [],
    image_Url: p.images?.[0] || "",
    price: p.price.toString(),
    stock_status: p.in_stock ? "active" : "outOfStock",
}));
// Write a simple standalone seed payload for inspection/import tooling.
const script = `
 module.exports = ${JSON.stringify(products, null, 2)};
 `;
// Write the script file
const scriptPath = "/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/backend/medusa/src/scripts/seed-products.js";
fs_1.default.writeFileSync(scriptPath, script);
console.log("seed-products.js written to " + scriptPath);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VlZC1wcm9kdWN0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY3JpcHRzL3NlZWQtcHJvZHVjdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSw0Q0FBb0I7QUFFbkIscURBQXFEO0FBQ3JELE1BQU0sV0FBVyxHQUFHLHdJQUF3SSxDQUFDO0FBRTdKLGdCQUFnQjtBQUNoQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFFN0QsbUNBQW1DO0FBQ25DLFNBQVMsT0FBTyxDQUFDLEdBQVc7SUFDMUIsT0FBTyxHQUFHO1NBQ1AsUUFBUSxFQUFFO1NBQ1YsV0FBVyxFQUFFO1NBQ2IsSUFBSSxFQUFFO1NBQ04sT0FBTyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7U0FDeEIsT0FBTyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUM7U0FDdkIsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUM7U0FDcEIsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUM3QixDQUFDO0FBRUQsMENBQTBDO0FBQzFDLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEMsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHO0lBQ1YsS0FBSyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsR0FBRztJQUNqQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksbUNBQW1DO0lBQ2xILFdBQVcsRUFBRSxDQUFDLEVBQUUsbURBQW1EO0lBQ25FLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUU7SUFDbEIsU0FBUyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO0lBQzlCLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRTtJQUN6QixZQUFZLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxZQUFZO0NBQ25ELENBQUMsQ0FBQyxDQUFDO0FBRUosd0VBQXdFO0FBQ3hFLE1BQU0sTUFBTSxHQUFHO29CQUNJLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7RUFDbkQsQ0FBQztBQUVGLHdCQUF3QjtBQUN4QixNQUFNLFVBQVUsR0FBRywrSkFBK0osQ0FBQztBQUNuTCxZQUFFLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixHQUFHLFVBQVUsQ0FBQyxDQUFDIn0=