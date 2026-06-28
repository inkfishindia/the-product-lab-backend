#!/usr/bin/env python3
"""
Step 1 of the WooCommerce -> Medusa import.

Reads the raw WooCommerce product export, groups variations under their parent
products, filters to published items, derives a usable INR price, and writes a
clean, import-ready JSON that the Medusa importer (import-woo.ts) consumes.

This does NOT touch the database. Run it, inspect import-catalog.json, then import.
"""
import csv, json, re, sys
from collections import defaultdict, Counter

csv.field_size_limit(10**7)

ROOT = "/Users/danish/Library/CloudStorage/GoogleDrive-danish@yourdesignstore.in/My Drive/market/the-product-lab-relaunch"
CSV_PATH = f"{ROOT}/TPL DUMP/wc-product-export-11-6-2026-1781128734010.csv"
OUT_PATH = f"{ROOT}/backend/medusa/src/scripts/import-catalog.json"


def slugify(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "product"


def price_of(row: str) -> float:
    """Parse a WooCommerce price cell to a float; 0.0 if blank/invalid."""
    raw = (row or "").strip().replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def category_of(row) -> str:
    """Last segment of the first category path (e.g. 'A > Keychains' -> 'Keychains')."""
    cats = (row.get("Categories") or "").split(",")
    first = cats[0].strip() if cats else ""
    return first.split(">")[-1].strip() or "Misc"


def images_of(row):
    return [u.strip() for u in (row.get("Images") or "").split(",") if u.strip()]


def main():
    rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))

    # Index variation children by their Parent SKU.
    kids_by_parent = defaultdict(list)
    for r in rows:
        if r["Type"] == "variation":
            kids_by_parent[r["Parent"].strip()].append(r)

    products = []
    skipped = Counter()
    seen_handles = set()

    for r in rows:
        t = r["Type"]
        if t not in ("simple", "variable"):
            continue  # variations are folded into their parent, not standalone
        if (r.get("Published") or "").strip() != "1":
            skipped["not_published"] += 1
            continue

        name = (r.get("Name") or "").strip()
        sku = (r.get("SKU") or "").strip()
        if not name:
            skipped["no_name"] += 1
            continue

        imgs = images_of(r)

        if t == "simple":
            price = price_of(r.get("Sale price")) or price_of(r.get("Regular price"))
        else:  # variable: parent has no price; derive from children
            kids = kids_by_parent.get(sku, [])
            kid_prices = [p for k in kids for p in [price_of(k.get("Sale price")) or price_of(k.get("Regular price"))] if p > 0]
            price = min(kid_prices) if kid_prices else 0.0
            for k in kids:  # pull in any child images too
                imgs += images_of(k)

        if price <= 0:
            skipped["no_price"] += 1
            continue

        # unique handle
        handle = slugify(sku or name)
        base, n = handle, 2
        while handle in seen_handles:
            handle = f"{base}-{n}"; n += 1
        seen_handles.add(handle)

        # de-dupe images, keep order
        seen_img, uniq_imgs = set(), []
        for u in imgs:
            if u not in seen_img:
                seen_img.add(u); uniq_imgs.append(u)

        stock_raw = (r.get("Stock") or "").strip()
        try:
            stock = max(0, int(float(stock_raw)))
        except ValueError:
            stock = 100  # default when WooCommerce didn't track stock

        products.append({
            "handle": handle,
            "sku": sku or handle.upper(),
            "title": name,
            "category": category_of(r),
            "tags": [t.strip() for t in (r.get("Tags") or "").split(",") if t.strip()],
            "description": (r.get("Description") or r.get("Short description") or "").strip(),
            "price": round(price, 2),
            "images": uniq_imgs[:10],
            "stock": stock,
            "type": t,
        })

    cats = Counter(p["category"] for p in products)
    json.dump(products, open(OUT_PATH, "w"), ensure_ascii=False, indent=2)

    print(f"Wrote {len(products)} products -> {OUT_PATH}")
    print(f"Skipped: {dict(skipped)}")
    print(f"Categories ({len(cats)}):")
    for c, n in cats.most_common():
        print(f"   {n:4d}  {c}")
    price_vals = [p["price"] for p in products]
    print(f"Price range: ₹{min(price_vals):.0f} - ₹{max(price_vals):.0f}")
    print(f"Products with images: {sum(1 for p in products if p['images'])}/{len(products)}")


if __name__ == "__main__":
    main()
