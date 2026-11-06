"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
// Paths
const jsonPath = '/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/cleaned_catalog.json';
const outputPath = '/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/backend/medusa/src/scripts/seed-catalog.ts';
// Load cleaned catalog JSON
const rawData = JSON.parse(fs_1.default.readFileSync(jsonPath, 'utf8'));
// Helper to sanitize strings for handle generation
function slugify(str) {
    return str
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/(\s|_)/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');
}
// Transform each product to Medusa seed format
const products = rawData.map((p) => ({
    title: p.name || p.title || p.sku,
    handle: slugify(p.sku || p.title || 'unknown-product'),
    category: p.categories ? p.categories[0] || 'misc' : 'misc',
    description: [p.short_description, p.description].filter(Boolean).join(' ') || 'Product description not available',
    image: p.images?.[0] || '',
    price: p.price || 0,
}));
// Write TypeScript file with the seed data
const content = `export const products: any[] = ${JSON.stringify(products, null, 2)};\n`;
fs_1.default.writeFileSync(outputPath, content);
console.log(`Generated ${products.length} seed entries at ${outputPath}`);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udmVydF9jYXRhbG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3NjcmlwdHMvY29udmVydF9jYXRhbG9nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsNENBQW9CO0FBR25CLFFBQVE7QUFDUixNQUFNLFFBQVEsR0FBRyx3SUFBd0ksQ0FBQztBQUMxSixNQUFNLFVBQVUsR0FBRyw4SkFBOEosQ0FBQztBQUVsTCw0QkFBNEI7QUFDNUIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFFLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBRTlELG1EQUFtRDtBQUNuRCxTQUFTLE9BQU8sQ0FBQyxHQUFXO0lBQzFCLE9BQU8sR0FBRztTQUNQLFFBQVEsRUFBRTtTQUNWLFdBQVcsRUFBRTtTQUNiLElBQUksRUFBRTtTQUNOLE9BQU8sQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO1NBQ3hCLE9BQU8sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO1NBQ3ZCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDO1NBQ3BCLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDN0IsQ0FBQztBQUVELCtDQUErQztBQUMvQyxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3hDLEtBQUssRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEdBQUc7SUFDakMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxLQUFLLElBQUksaUJBQWlCLENBQUM7SUFDdEQsUUFBUSxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNO0lBQzNELFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxtQ0FBbUM7SUFDbEgsS0FBSyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFO0lBQzFCLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUM7Q0FDcEIsQ0FBQyxDQUFDLENBQUM7QUFFSiwyQ0FBMkM7QUFDM0MsTUFBTSxPQUFPLEdBQUcsa0NBQWtDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBRXpGLFlBQUUsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxRQUFRLENBQUMsTUFBTSxvQkFBb0IsVUFBVSxFQUFFLENBQUMsQ0FBQyJ9