import fs from 'fs';
import path from 'path';

 // Paths
 const jsonPath = '/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/cleaned_catalog.json';
 const outputPath = '/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch/backend/medusa/src/scripts/seed-catalog.ts';

 // Load cleaned catalog JSON
 const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

 // Helper to sanitize strings for handle generation
 function slugify(str: string): string {
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
 const products = rawData.map((p: any) => ({
   title: p.name || p.title || p.sku,
   handle: slugify(p.sku || p.title || 'unknown-product'),
   category: p.categories ? p.categories[0] || 'misc' : 'misc',
   description: [p.short_description, p.description].filter(Boolean).join(' ') || 'Product description not available',
   image: p.images?.[0] || '',
   price: p.price || 0,
 }));

 // Write TypeScript file with the seed data
 const content = `export const products: any[] = ${JSON.stringify(products, null, 2)};\n`;

 fs.writeFileSync(outputPath, content);
 console.log(`Generated ${products.length} seed entries at ${outputPath}`);
