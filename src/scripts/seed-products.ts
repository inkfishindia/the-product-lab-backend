import fs from "fs";

 // Path to the cleaned catalog JSON generated earlier
 const catalogPath = "/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/cleaned_catalog.json";

 // Load the JSON
 const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

 // Helper to generate a simple slug
 function slugify(str: string): string {
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
 const products = raw.map((p: any) => ({
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
 fs.writeFileSync(scriptPath, script);
 console.log("seed-products.js written to " + scriptPath);
