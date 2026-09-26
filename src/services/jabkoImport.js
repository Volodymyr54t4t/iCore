import { pool } from "../db/pool.js";

const CATEGORIES = [
  { slug: "iphone", url: "https://jabko.ua/iphone/", name: "iPhone" },
  { slug: "airpods", url: "https://jabko.ua/apple-airpods/", name: "AirPods" },
  { slug: "mac", url: "https://jabko.ua/mac/", name: "Mac" },
];
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; iCoreCatalogImporter/1.0; +https://icore.store)",
  "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
};
let importRunning = false;

function isUsedProduct(product) {
  const description = Object.entries(product.specifications || {}).flat().join(" ");
  return /б\s*[\/\\]\s*у|б\s+у|вживан|як\s+нов(ий|а|е)|хороший\s+стан|стандартна\s+батарея|refurbished|\bused\b/i
    .test(`${product.name || ""} ${product.sourceUrl || ""} ${description}`);
}

function decodeHtml(value = "") {
  return value
    .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)));
}

function plainText(html = "") {
  return decodeHtml(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : "";
}

function price(value) {
  const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function categoryItems(html, category) {
  const items = [];
  const cardPattern = /<div\s+class="catalog-product-item">([\s\S]*?)<!--\s*catalog-product-item\s*-->/gi;
  for (const [, card] of html.matchAll(cardPattern)) {
    const titleTag = card.match(/<a\b(?=[^>]*class="catalog-product-item--title")[^>]*>/i)?.[0];
    if (!titleTag) continue;
    const sourceId = attribute(titleTag, "data-id");
    const sourceUrl = attribute(titleTag, "href");
    const name = plainText(card.match(/<a\b[^>]*class="catalog-product-item--title"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    if (!sourceId || !name || !/^https:\/\/jabko\.ua\/(?:product\/|[^?]+\/[^?]+)$/.test(sourceUrl)) continue;
    if (isUsedProduct({ name, sourceUrl })) continue;
    const priceBlock = card.match(/<div\s+class="catalog-product-item--price">([\s\S]*?)<\/div>/i)?.[1] || "";
    const sourcePrice = price(priceBlock.match(/class="current"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const sourceOldPrice = price(priceBlock.match(/class="old"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const imageMatches = [...card.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)];
    const image = imageMatches.map((match) => attribute(match[0], "src")).find((url) => url.startsWith("https://img.jabko.ua/")) || "";
    if (!sourcePrice) continue;
    items.push({ sourceId, sourceUrl, name, sourcePrice, sourceOldPrice: sourceOldPrice && sourceOldPrice > sourcePrice ? sourceOldPrice : null, image, category });
  }
  return items;
}

async function getHtml(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000), redirect: "follow" });
  if (!response.ok) throw new Error(`Ябко повернув HTTP ${response.status} для ${url}`);
  const html = await response.text();
  if (!html.includes("catalog-product-item") && !html.includes('"@type": "Product"')) throw new Error(`Не впізнано сторінку каталогу Ябко: ${url}`);
  return html;
}

async function collectCategory(category, limit = 0, onPage = () => {}) {
  const pages = new Set();
  const products = new Map();
  let nextUrl = category.url;
  while (nextUrl && !pages.has(nextUrl)) {
    pages.add(nextUrl);
    const html = await getHtml(nextUrl);
    onPage({ category: category.slug, page: pages.size, url: nextUrl });
    for (const product of categoryItems(html, category.slug)) {
      if (!products.has(product.sourceId)) products.set(product.sourceId, product);
      if (limit && products.size >= limit) return { products: [...products.values()], complete: false, pages: pages.size };
    }
    const next = html.match(/<a\b[^>]*class="pag-item-link pag-item-link-next"[^>]*href="([^"]+)"/i)?.[1]
      || html.match(/<link\b[^>]*rel="next"[^>]*href="([^"]+)"/i)?.[1];
    nextUrl = next ? new URL(decodeHtml(next), nextUrl).href : "";
    if (nextUrl && (!nextUrl.startsWith("https://jabko.ua/") || new URL(nextUrl).pathname !== new URL(category.url).pathname)) {
      throw new Error(`Пагінація вийшла за межі категорії ${category.slug}`);
    }
  }
  if (!products.size) throw new Error(`У категорії ${category.slug} не знайдено товарів`);
  return { products: [...products.values()], complete: true, pages: pages.size };
}

function productJsonLd(html) {
  for (const [, script] of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(script.trim());
      const candidates = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
      const product = candidates.find((entry) => entry?.["@type"] === "Product");
      if (product) return product;
    } catch { /* Other JSON-LD blocks on the page are unrelated. */ }
  }
  throw new Error("На сторінці товару не знайдено Product JSON-LD");
}

function parseSpecifications(html) {
  const block = html.match(/<div\b[^>]*id="block-attrib"[^>]*>([\s\S]*?)(?=<div\b[^>]*id="block-review")/i)?.[1] || "";
  const specs = {};
  for (const [, keyHtml, valueHtml] of block.matchAll(/<div\s+class="attribute-name"[^>]*>([\s\S]*?)<\/div>[\s\S]{0,1400}?<div\s+class="attribute-text"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const key = plainText(keyHtml);
    const value = plainText(valueHtml);
    if (key && value) specs[key] = value;
  }
  return specs;
}

function parseProductPage(html, listing) {
  const data = productJsonLd(html);
  const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers || {};
  const sourcePrice = listing.sourcePrice || price(offer.price);
  if (!sourcePrice || !data.name) throw new Error("Не вдалося визначити назву або ціну товару");
  const oldPrice = price(html.match(/class="price-old__uah"[^>]*>([\s\S]*?)<\/span>/i)?.[1]) || listing.sourceOldPrice;
  const gallery = html.match(/<div\s+class="product-img__slider-main[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="product-img__slider-submain/i)?.[1] || "";
  const images = [...new Set([...gallery.matchAll(/<a\b[^>]*class="fresco"[^>]*href="([^"]+)"/gi)].map((match) => decodeHtml(match[1])).filter((url) => url.startsWith("https://img.jabko.ua/")))];
  const coverImage = typeof data.image === "string" ? data.image : Array.isArray(data.image) ? data.image[0] : listing.image;
  if (!images.length && coverImage) images.unshift(coverImage);
  const specs = parseSpecifications(html);
  const title = String(data.name).trim();
  const colorNames = ["Space Black", "Space Gray", "Natural Titanium", "White Titanium", "Blue Titanium", "Black Titanium", "Cosmic Orange", "Deep Blue", "Sky Blue", "Light Gold", "Rose Gold", "Desert Titanium", "Natural", "Silver", "Black", "White", "Gray", "Grey", "Gold", "Blue", "Green", "Purple", "Pink", "Yellow", "Orange", "Midnight", "Starlight", "Citrus", "Blush", "Lavender", "Mist Blue", "Ultramarine", "Graphite", "Titanium"];
  const color = specs["Колір"] || specs["Колір пристрою"] || colorNames.find((candidate) => title.toLowerCase().includes(candidate.toLowerCase())) || [...title.matchAll(/\(([^()]+)\)/g)].map((match) => match[1]).find((value) => !/^\d{4}$/.test(value) && !/^[A-Z0-9-]{4,}$/i.test(value)) || "";
  const storage = title.match(/\b\d+(?:\.\d+)?\s?(?:TB|GB|ГБ|ТБ)\b/i)?.[0] || "";
  const slug = new URL(listing.sourceUrl).pathname.replace(/\/+$/, "").split("/").pop();
  return {
    ...listing,
    slug,
    name: title,
    price: sourcePrice,
    sourceOldPrice: oldPrice && oldPrice > sourcePrice ? oldPrice : null,
    sourceSku: String(data.sku || data.model || ""),
    sourceModel: String(data.model || ""),
    brand: typeof data.brand === "string" ? data.brand : data.brand?.name || "",
    description: String(data.description || "").trim(),
    specifications: specs,
    images,
    imageUrl: images[0] || coverImage || listing.image || "",
    color,
    storage,
    available: /inStock/i.test(String(offer.availability || "")) || /class="product-info__flex-status[^>]*>\s*В наявності/i.test(html),
  };
}

async function enrichProduct(listing) {
  const html = await getHtml(listing.sourceUrl);
  return parseProductPage(html, listing);
}

function markupFor(category, product = {}) {
  const name = String(product.name || "");
  if (category === "iphone") return /\bpro\b/i.test(name) ? 5 : 7;
  if (category === "mac") return /mac\s*book\s*pro|mac\s*pro|mac\s*studio/i.test(name) ? 5 : 6;
  if (category === "airpods") return /чохол|кейс|амбушур|насадк|кабель|адаптер|зарядн|ремінець|накладк|case|cover|ear\s*tip|cable|adapter|charger/i.test(name) ? 15 : 10;
  return 0;
}

function shopPrice(sourcePrice, markup) { return Math.round(sourcePrice * (1 + markup / 100)); }

async function prepareDatabaseForFirstSync() {
  const { rows } = await pool.query("SELECT value FROM system_flags WHERE key='jabko_initial_cleanup_done'");
  if (rows[0]?.value === "true") return false;
  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM products");
    await pool.query(`INSERT INTO system_flags (key, value, updated_at) VALUES ('jabko_initial_cleanup_done','true',NOW())
      ON CONFLICT (key) DO UPDATE SET value='true', updated_at=NOW()`);
    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function upsertProduct(product, categoryIds, db = pool) {
  const markup = markupFor(product.category, product);
  const nextPrice = shopPrice(product.price, markup);
  const oldPrice = product.sourceOldPrice ? shopPrice(product.sourceOldPrice, markup) : null;
  const { rows } = await db.query(`INSERT INTO products
    (category_id, slug, name, tagline, description, price, old_price, color, storage, stock, image_url, featured,
     source, source_id, source_url, source_sku, source_model, source_available, source_price, source_old_price, markup_percent, brand, specifications, images, is_active, cost_price)
    VALUES ($1,$2,$3,'',$4,$5,$6,$7,$8,$9,$10,FALSE,'jabko',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,TRUE,$22)
    ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
      category_id=EXCLUDED.category_id, slug=EXCLUDED.slug, name=EXCLUDED.name, description=EXCLUDED.description,
      price=EXCLUDED.price, old_price=EXCLUDED.old_price, color=EXCLUDED.color, storage=EXCLUDED.storage,
      stock=EXCLUDED.stock, image_url=EXCLUDED.image_url, source_url=EXCLUDED.source_url, source_sku=EXCLUDED.source_sku,
      source_model=EXCLUDED.source_model, source_available=EXCLUDED.source_available,
      source_price=EXCLUDED.source_price, source_old_price=EXCLUDED.source_old_price, markup_percent=EXCLUDED.markup_percent,
      brand=EXCLUDED.brand, specifications=EXCLUDED.specifications, images=EXCLUDED.images, is_active=TRUE, cost_price=EXCLUDED.cost_price, updated_at=NOW()
    RETURNING id, (xmax = 0) AS inserted`, [
    categoryIds[product.category], product.slug, product.name, product.description, nextPrice, oldPrice,
    product.color, product.storage, product.available ? 1 : 0, product.imageUrl, product.sourceId,
    product.sourceUrl, product.sourceSku, product.sourceModel, product.available, product.price, product.sourceOldPrice, markup, product.brand,
    JSON.stringify(product.specifications), JSON.stringify(product.images), product.price,
  ]);
  return { id: rows[0].id, updated: !rows[0].inserted, price: nextPrice };
}

export async function verifyJabkoDatabaseWrite() {
  const sample = [];
  for (const category of CATEGORIES) {
    const { products } = await collectCategory(category, 1);
    sample.push(await enrichProduct(products[0]));
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id,slug FROM categories WHERE slug = ANY($1::text[])", [CATEGORIES.map((category) => category.slug)]);
    const categoryIds = Object.fromEntries(rows.map((row) => [row.slug, row.id]));
    const results = [];
    for (const product of sample) {
      if (!categoryIds[product.category]) throw new Error(`Не знайдено категорію ${product.category}`);
      results.push({ name: product.name, ...(await upsertProduct(product, categoryIds, client)) });
    }
    await client.query("ROLLBACK");
    return { verified: results.length, results };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release?.();
  }
}

async function runJabkoImportInternal({ limit = 0, dryRun = false, onProgress = () => {} } = {}) {
  const stats = { found: 0, imported: 0, updated: 0, new: 0, skipped: 0, errors: 0, pages: {}, errorMessages: [], sample: [] };
  const listings = [];
  let remaining = limit;
  for (let categoryIndex = 0; categoryIndex < CATEGORIES.length; categoryIndex += 1) {
    if (limit && remaining <= 0) break;
    const category = CATEGORIES[categoryIndex];
    const categoryLimit = limit ? Math.max(1, Math.ceil(remaining / (CATEGORIES.length - categoryIndex))) : 0;
    const result = await collectCategory(category, categoryLimit, (progress) => onProgress({ phase: "collecting", ...progress, stats }));
    stats.pages[category.slug] = result.pages;
    listings.push(...result.products);
    if (limit) remaining -= result.products.length;
  }
  const uniqueListings = [...new Map(listings.map((item) => [item.sourceId, item])).values()];
  stats.found = uniqueListings.length;
  onProgress({ phase: "product-pages", current: 0, total: stats.found, stats });

  const enriched = [];
  let next = 0;
  const worker = async () => {
    while (next < uniqueListings.length) {
      const index = next++;
      const listing = uniqueListings[index];
      try {
        const product = await enrichProduct(listing);
        if (isUsedProduct(product)) {
          stats.skipped += 1;
          continue;
        }
        enriched.push(product);
        if (stats.sample.length < 10) stats.sample.push({ name: product.name, category: product.category, sourcePrice: product.price, markupPercent: markupFor(product.category, product), storePrice: shopPrice(product.price, markupFor(product.category, product)), image: product.imageUrl, url: product.sourceUrl, sku: product.sourceSku, color: product.color, storage: product.storage, available: product.available, specifications: product.specifications });
      } catch (error) {
        stats.errors += 1;
        stats.skipped += 1;
        if (stats.errorMessages.length < 30) stats.errorMessages.push({ url: listing.sourceUrl, error: error.message });
        console.error("Помилка імпорту товару Ябко:", listing.sourceUrl, error.message);
      }
      onProgress({ phase: "product-pages", current: Math.min(index + 1, uniqueListings.length), total: stats.found, stats });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, uniqueListings.length) }, worker));

  if (!dryRun && stats.found && !enriched.length) throw new Error("Не отримано жодної сторінки товару; базу не очищено");
  if (!dryRun && limit && !enriched.length) throw new Error("Тестовий імпорт не отримав товарів");
  if (dryRun) return stats;

  const cleaned = await prepareDatabaseForFirstSync();
  stats.cleanedLegacyProducts = cleaned;
  const { rows: categories } = await pool.query("SELECT id, slug FROM categories WHERE slug = ANY($1::text[])", [CATEGORIES.map((category) => category.slug)]);
  const categoryIds = Object.fromEntries(categories.map((category) => [category.slug, category.id]));
  for (const category of CATEGORIES) if (!categoryIds[category.slug]) throw new Error(`Не знайдено категорію ${category.slug}`);

  for (const product of enriched) {
    try {
      const result = await upsertProduct(product, categoryIds);
      stats.imported += 1;
      if (result.updated) stats.updated += 1;
      else stats.new += 1;
    } catch (error) {
      stats.errors += 1;
      stats.skipped += 1;
      if (stats.errorMessages.length < 30) stats.errorMessages.push({ url: product.sourceUrl, error: error.message });
      console.error("Помилка запису товару Ябко:", product.sourceUrl, error.message);
    }
    onProgress({ phase: "database", current: stats.imported + stats.skipped, total: enriched.length, stats });
  }

  if (!limit) {
    for (const category of CATEGORIES) {
      const ids = uniqueListings.filter((item) => item.category === category.slug).map((item) => item.sourceId);
      if (ids.length) await pool.query("UPDATE products SET is_active=FALSE, source_available=FALSE, stock=0, updated_at=NOW() WHERE source='jabko' AND category_id=$1 AND NOT (source_id = ANY($2::text[]))", [categoryIds[category.slug], ids]);
    }
  }
  return stats;
}

export async function runJabkoImport(options = {}) {
  const reservation = reserveJabkoImport();
  if (!reservation) throw new Error("Імпорт Ябко вже виконується");
  return reservation.run(options);
}

export function isJabkoImportRunning() { return importRunning; }

export function reserveJabkoImport() {
  if (importRunning) return null;
  importRunning = true;
  let consumed = false;
  return {
    run(options = {}) {
      if (consumed) throw new Error("Резерв імпорту вже використаний");
      consumed = true;
      return runJabkoImportInternal(options).finally(() => { importRunning = false; });
    },
    release() {
      if (consumed) return;
      consumed = true;
      importRunning = false;
    },
  };
}

export async function scanJabkoCatalog({ onProgress = () => {} } = {}) {
  const result = { found: 0, categories: {}, pages: {} };
  const ids = new Set();
  for (const category of CATEGORIES) {
    const scanned = await collectCategory(category, 0, (progress) => onProgress(progress));
    result.categories[category.slug] = scanned.products.length;
    result.pages[category.slug] = scanned.pages;
    for (const product of scanned.products) ids.add(product.sourceId);
    result.found += scanned.products.length;
  }
  result.uniqueProducts = ids.size;
  return result;
}

export async function jabkoImportSettings() {
  return {
    iphoneMarkupPercent: 7,
    otherMarkupPercent: 10,
    markupRules: [
      { label: "iPhone", rate: "7%" },
      { label: "iPhone Pro / Pro Max", rate: "5%" },
      { label: "AirPods", rate: "10%" },
      { label: "Аксесуари AirPods", rate: "15%" },
      { label: "MacBook Air та інші Mac", rate: "6%" },
      { label: "MacBook Pro та преміальні Mac", rate: "5%" },
    ],
    categories: CATEGORIES,
  };
}
