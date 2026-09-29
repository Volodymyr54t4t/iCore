import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/async.js";
import { createOrder } from "../services/orders.js";
import { notifyNewOrder } from "../telegram/bot.js";
import { readCustomer } from "../middleware/auth.js";
import { logActivity } from "../services/activity.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { sendContactMail } from "../services/contactMail.js";
import { subscribeNewsletter } from "../services/newsletter.js";

export const publicRouter = Router();

const contactAttempts = new Map();
const subscribeAttempts = new Map();
const reviewAttempts = new Map();
const orderLookupAttempts = new Map();

function allowOrderLookup(ip) {
  const now = Date.now();
  const attempts = (orderLookupAttempts.get(ip) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (attempts.length >= 5) return false;
  attempts.push(now);
  orderLookupAttempts.set(ip, attempts);
  return true;
}

function allowReviewRequest(ip) {
  const now = Date.now();
  const attempts = (reviewAttempts.get(ip) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (attempts.length >= 5) return false;
  attempts.push(now);
  reviewAttempts.set(ip, attempts);
  return true;
}

function allowContactRequest(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (contactAttempts.get(ip) || []).filter((time) => now - time < windowMs);
  if (attempts.length >= 5) return false;
  attempts.push(now);
  contactAttempts.set(ip, attempts);
  return true;
}

function allowSubscribeRequest(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const attempts = (subscribeAttempts.get(ip) || []).filter((time) => now - time < windowMs);
  if (attempts.length >= 5) return false;
  attempts.push(now);
  subscribeAttempts.set(ip, attempts);
  return true;
}

function mapProduct(row, { includeDetails = true } = {}) {
  const product = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    price: row.price,
    oldPrice: row.old_price,
    color: row.color,
    storage: row.storage,
    stock: row.stock,
    imageUrl: row.image_url,
    featured: row.featured,
    isAvailable: row.source === "jabko" ? row.source_available : row.stock > 0,
    category: {
      id: row.category_id,
      slug: row.category_slug,
      name: row.category_name,
    },
  };
  if (includeDetails) {
    product.description = row.description;
    product.specifications = row.specifications || {};
  }
  return product;
}

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

publicRouter.get("/categories", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, name FROM categories WHERE slug = ANY($1::text[]) ORDER BY array_position($1::text[], slug)",
    [["iphone", "airpods", "mac"]]
  );
  res.json(rows);
}));

publicRouter.get("/content", asyncHandler(async (req, res) => {
  const page = String(req.query.path || "/");
  if (!/^\/[a-z0-9._/-]*$/i.test(page) || page.length > 120) return res.status(400).json({ error: "Некоректна сторінка" });
  const { rows } = await pool.query(
    "SELECT selector, property, value FROM site_content WHERE path = $1 ORDER BY id",
    [page]
  );
  res.json(rows);
}));

publicRouter.post("/contact", asyncHandler(async (req, res) => {
  const { name, email, phone, topic, message, website } = req.body || {};
  if (website) return res.status(201).json({ ok: true }); // Honeypot for automated submissions.
  if (!allowContactRequest(req.ip)) return res.status(429).json({ error: "Забагато звернень. Спробуйте ще раз трохи пізніше." });
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 100) return res.status(400).json({ error: "Вкажіть ваше ім’я" });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return res.status(400).json({ error: "Вкажіть коректний email" });
  if (typeof topic !== "string" || topic.trim().length < 2 || topic.length > 100) return res.status(400).json({ error: "Оберіть тему звернення" });
  if (typeof message !== "string" || message.trim().length < 10 || message.length > 3000) return res.status(400).json({ error: "Повідомлення має містити від 10 до 3000 символів" });
  if (phone && (typeof phone !== "string" || phone.length > 40)) return res.status(400).json({ error: "Перевірте номер телефону" });
  try {
    await sendContactMail({ name: name.trim(), email: email.trim(), phone: String(phone || "").trim(), topic: topic.trim(), message: message.trim() });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Contact mail:", error.message);
    res.status(503).json({ error: "Не вдалося надіслати повідомлення. Спробуйте ще раз або зателефонуйте нам." });
  }
}));

publicRouter.post("/newsletter/subscribe", asyncHandler(async (req, res) => {
  const { email, website } = req.body || {};
  if (website) return res.status(201).json({ ok: true });
  if (!allowSubscribeRequest(req.ip)) return res.status(429).json({ error: "Забагато спроб. Спробуйте трохи пізніше." });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    return res.status(400).json({ error: "Вкажіть коректну email-адресу" });
  }
  await subscribeNewsletter(email);
  res.status(201).json({ ok: true });
}));

publicRouter.get("/newsletter/unsubscribe", asyncHandler(async (req, res) => {
  const token = String(req.query.token || "");
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).send("Некоректне посилання");
  const { rowCount } = await pool.query(
    "UPDATE newsletter_subscribers SET is_active = FALSE, unsubscribed_at = NOW() WHERE unsubscribe_token = $1 AND is_active = TRUE",
    [token]
  );
  const message = rowCount ? "Ви успішно відписалися від розсилки iCore." : "Ця адреса вже відписана від розсилки iCore.";
  res.type("html").send(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>iCore</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1d1d1f"><main style="max-width:420px;padding:40px;text-align:center;border-radius:24px;background:#fff;box-shadow:0 18px 45px rgba(0,0,0,.08)"><p style="margin:0 0 14px;color:#0071e3;font-weight:700;letter-spacing:.1em;font-size:11px">iCORE STORE</p><h1 style="margin:0;font-size:27px;letter-spacing:-.04em">Готово</h1><p style="color:#6e6e73;line-height:1.5">${message}</p><a href="/" style="color:#0071e3;text-decoration:none;font-weight:600">На головну →</a></main></body></html>`);
}));

publicRouter.get("/products", asyncHandler(async (req, res) => {
  const { category, q, sort, featured, capacity, sim, color, available } = req.query;
  const params = [];
  const where = ["p.is_active = TRUE"];

  if (category) {
    params.push(category);
    where.push(`c.slug = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.tagline ILIKE $${params.length})`);
  }
  if (featured === "1") {
    where.push("p.featured = TRUE");
  }
  if (capacity) { params.push("Об'єм пам'яті", String(capacity)); where.push(`p.specifications->>$${params.length - 1} = $${params.length}`); }
  if (sim) { params.push("Формат SIM-карти", String(sim)); where.push(`p.specifications->>$${params.length - 1} = $${params.length}`); }
  if (color) { params.push("Колір пристрою", String(color), String(color)); where.push(`(p.specifications->>$${params.length - 2} = $${params.length - 1} OR p.color = $${params.length})`); }
  if (available === "1") where.push("(CASE WHEN p.source = 'jabko' THEN p.source_available ELSE p.stock > 0 END) = TRUE");
  for (const [key, value] of Object.entries(req.query)) {
    if (!key.startsWith("spec:") || typeof value !== "string" || !value) continue;
    params.push(key.slice(5), value);
    where.push(`p.specifications->>$${params.length - 1} = $${params.length}`);
  }

  let order = "p.featured DESC, p.id DESC";
  if (sort === "price_asc") order = "p.price ASC";
  if (sort === "price_desc") order = "p.price DESC";
  if (sort === "name") order = "p.name ASC";
  if (sort === "availability") order = "(CASE WHEN p.source = 'jabko' THEN p.source_available ELSE p.stock > 0 END) DESC, p.featured DESC, p.id DESC";

  const sql = `${PRODUCT_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}`;
  if (req.query.limit !== undefined) {
    const limit = Math.min(60, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const countSql = `SELECT COUNT(*)::int AS total FROM products p JOIN categories c ON c.id=p.category_id WHERE ${where.join(" AND ")}`;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(countSql, params),
      pool.query(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
    ]);
    return res.json({ products: rows.map((row) => mapProduct(row, { includeDetails: false })), total: countRows[0].total, limit, offset });
  }
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(mapProduct));
}));

publicRouter.get("/products/deals", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`${PRODUCT_SELECT}
    WHERE p.is_active = TRUE AND p.old_price > p.price
      AND (CASE WHEN p.source = 'jabko' THEN p.source_available ELSE p.stock > 0 END) = TRUE
    ORDER BY ((p.old_price - p.price)::numeric / NULLIF(p.old_price, 0)) DESC, p.id DESC
    LIMIT 4`);
  res.json(rows.map((row) => mapProduct(row, { includeDetails: false })));
}));

const facetCache = new Map();
publicRouter.get("/products/facets", asyncHandler(async (req, res) => {
  const category = String(req.query.category || "");
  const cached = facetCache.get(category);
  if (cached && Date.now() - cached.time < 60_000) return res.json(cached.data);
  const { rows } = await pool.query(`SELECT p.specifications, p.color, p.source, p.source_available, p.stock
    FROM products p JOIN categories c ON c.id=p.category_id WHERE p.is_active=TRUE AND c.slug=$1`, [category]);
  const discoveredKeys = new Set(["Об'єм пам'яті", "Формат SIM-карти", "Колір пристрою", "Оперативна пам'ять", "Діагональ дисплея", "Тип підключення", "Тип кейсу"]);
  for (const row of rows) {
    for (const key of Object.keys(row.specifications || {})) {
      if (/пам'ят|sim|колір|диспле|підключ|кейсу/i.test(key)) discoveredKeys.add(key);
    }
  }
  const facets = {};
  for (const key of discoveredKeys) {
    const counts = new Map();
    for (const row of rows) {
      const value = row.specifications?.[key] || (key === "Колір пристрою" ? row.color : null);
      if (typeof value === "string" && value.trim()) counts.set(value.trim(), (counts.get(value.trim()) || 0) + 1);
    }
    if (counts.size) facets[key] = [...counts].map(([value, count]) => ({ value, count })).sort((a,b) => a.value.localeCompare(b.value, "uk"));
  }
  const result = { facets, availability: rows.reduce((sum, row) => sum + (row.source === "jabko" ? row.source_available : row.stock > 0 ? 1 : 0), 0), total: rows.length };
  facetCache.set(category, { data: result, time: Date.now() });
  res.json(result);
}));

publicRouter.get("/products/:slug", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.slug = $1 AND p.is_active = TRUE`, [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: "Товар не знайдено" });
  res.json(mapProduct(rows[0]));
}));

publicRouter.get("/products/:slug/reviews", asyncHandler(async (req, res) => {
  const { rows: products } = await pool.query("SELECT id FROM products WHERE slug = $1", [req.params.slug]);
  if (!products[0]) return res.status(404).json({ error: "Товар не знайдено" });
  const productId = products[0].id;
  const [{ rows: summary }, { rows: reviews }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average FROM product_reviews WHERE product_id=$1 AND status='published'", [productId]),
    pool.query("SELECT id, author_name, rating, title, body, is_verified, created_at FROM product_reviews WHERE product_id=$1 AND status='published' ORDER BY created_at DESC LIMIT 100", [productId]),
  ]);
  res.json({ ...summary[0], reviews });
}));

publicRouter.post("/products/:slug/reviews", asyncHandler(async (req, res) => {
  if (!allowReviewRequest(req.ip)) return res.status(429).json({ error: "Забагато відгуків. Спробуйте пізніше." });
  const customer = readCustomer(req);
  const { authorName, rating, title = "", body } = req.body || {};
  if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ error: "Оберіть оцінку від 1 до 5 зірок" });
  if (typeof body !== "string" || body.trim().length < 10 || body.trim().length > 2000) return res.status(400).json({ error: "Відгук має містити від 10 до 2000 символів" });
  if (title && (typeof title !== "string" || title.trim().length > 100)) return res.status(400).json({ error: "Заголовок має бути до 100 символів" });
  const name = customer?.name || (typeof authorName === "string" ? authorName.trim() : "");
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Вкажіть ім’я від 2 до 80 символів" });
  const { rows: products } = await pool.query("SELECT id FROM products WHERE slug=$1", [req.params.slug]);
  if (!products[0]) return res.status(404).json({ error: "Товар не знайдено" });
  let verified = false;
  if (customer) {
    const purchase = await pool.query(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE oi.product_id=$1 AND o.customer_id=$2 AND o.status='done' LIMIT 1`, [products[0].id, customer.id]);
    verified = purchase.rowCount > 0;
  }
  await pool.query(`INSERT INTO product_reviews (product_id, customer_id, author_name, rating, title, body, is_verified)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [products[0].id, customer?.id || null, name, Number(rating), String(title).trim(), body.trim(), verified]);
  res.status(201).json({ ok: true, message: "Дякуємо! Відгук з’явиться після перевірки модератором." });
}));

publicRouter.post("/orders", asyncHandler(async (req, res) => {
  const { name, phone, email, city, address, notes, items } = req.body || {};
  const customer = readCustomer(req);

  try {
    const order = await createOrder({
      name,
      phone,
      email,
      city,
      address,
      notes,
      items,
      customerId: customer?.id || null,
    });
    notifyNewOrder(order).catch((error) => console.error("Telegram notify:", error.message));
    res.status(201).json({
      id: order.id,
      total: order.total,
      paymentAmount: order.paymentAmount,
      receipt: order.receipt,
      paymentUrl: `/payment.html?order=${order.id}&token=${order.paymentToken}`,
      trackingUrl: `/track-order.html?order=${order.id}&token=${order.paymentToken}`,
      account: Boolean(customer),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Не вдалося оформити замовлення" });
  }
}));

publicRouter.post("/orders/lookup", asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const customer = readCustomer(req);
  if (!customer && !allowOrderLookup(req.ip)) return res.status(429).json({ error: "Забагато спроб. Спробуйте ще раз за годину." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (!customer && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 9 || phone.length > 15)) {
    return res.status(400).json({ error: "Вкажіть email і телефон, які ви використали під час оформлення." });
  }

  const query = `SELECT o.id,o.status,o.total,o.created_at,o.payment_token,
      (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id=o.id) AS item_count
    FROM orders o`;
  const { rows } = customer
    ? await pool.query(`${query} WHERE o.customer_id=$1 ORDER BY o.created_at DESC`, [customer.id])
    : await pool.query(`${query}
      WHERE LOWER(BTRIM(o.customer_email))=$1
        AND REGEXP_REPLACE(o.customer_phone,'[^0-9]','','g')=$2
      ORDER BY o.created_at DESC`, [email, phone]);
  res.json({ orders: rows.map((order) => ({
    id: order.id,
    status: order.status,
    total: order.total,
    createdAt: order.created_at,
    itemCount: order.item_count,
    trackingUrl: `/track-order.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.payment_token)}`,
  })) });
}));

async function paymentOrder(id, token) {
  const { rows } = await pool.query(
    `SELECT id, customer_name, total, status, payment_status, payment_provider, payment_amount, payment_receipt,
            payment_proof_url, payment_proof_at, payment_confirmed_at, payment_token,
            city, address, created_at, confirmed_at
     FROM orders WHERE id = $1 AND payment_token = $2`,
    [id, token]
  );
  return rows[0] || null;
}

publicRouter.get("/orders/:id/payment", asyncHandler(async (req, res) => {
  const order = await paymentOrder(req.params.id, req.query.token);
  if (!order) return res.status(404).json({ error: "Рахунок не знайдено або посилання більше не дійсне" });
  res.json({
    id: order.id,
    total: order.total,
    status: order.status,
    paymentStatus: order.payment_status,
    provider: order.payment_provider,
    paymentAmount: order.payment_amount,
    receipt: order.payment_receipt,
    proofUrl: order.payment_proof_url,
    proofAt: order.payment_proof_at,
    paymentConfirmedAt: order.payment_confirmed_at,
  });
}));

publicRouter.get("/orders/:id/tracking", asyncHandler(async (req, res) => {
  const order = await paymentOrder(req.params.id, req.query.token);
  if (!order) return res.status(404).json({ error: "Замовлення не знайдено або посилання недійсне" });
  const { rows: items } = await pool.query(
    "SELECT product_name, quantity, price FROM order_items WHERE order_id = $1 ORDER BY id",
    [order.id]
  );
  res.json({
    id: order.id,
    customerName: order.customer_name,
    status: order.status,
    paymentStatus: order.payment_status,
    total: order.total,
    paymentAmount: order.payment_amount,
    receipt: order.payment_receipt,
    paymentConfirmedAt: order.payment_confirmed_at,
    proofAt: order.payment_proof_at,
    items,
    city: order.city,
    address: order.address,
    created_at: order.created_at,
    confirmed_at: order.confirmed_at,
  });
}));

publicRouter.patch("/orders/:id/payment-method", asyncHandler(async (req, res) => {
  const { token, provider } = req.body || {};
  if (!["monobank", "privatbank"].includes(provider)) return res.status(400).json({ error: "Оберіть банк для передоплати" });
  const order = await paymentOrder(req.params.id, token);
  if (!order) return res.status(404).json({ error: "Рахунок не знайдено" });
  if (order.status === "new" || order.payment_status === "awaiting_confirmation") return res.status(409).json({ error: "Дочекайтеся дзвінка менеджера та підтвердження замовлення" });
  if (order.status === "cancelled") return res.status(409).json({ error: "Скасоване замовлення не можна оплатити" });
  if (order.payment_status === "proof_submitted" || order.payment_status === "confirmed") return res.status(400).json({ error: "Підтвердження оплати вже надіслано" });
  await pool.query("UPDATE orders SET payment_provider = $1 WHERE id = $2", [provider, order.id]);
  res.json({ ok: true, provider });
}));

publicRouter.post("/orders/:id/payment-proof", asyncHandler(async (req, res) => {
  const { token, dataUrl } = req.body || {};
  const order = await paymentOrder(req.params.id, token);
  if (!order) return res.status(404).json({ error: "Рахунок не знайдено" });
  if (order.status === "new" || order.payment_status === "awaiting_confirmation") return res.status(409).json({ error: "Оплата стане доступною після дзвінка та підтвердження менеджером" });
  if (order.status === "cancelled") return res.status(409).json({ error: "Скасоване замовлення не можна оплатити" });
  if (!order.payment_provider) return res.status(400).json({ error: "Спершу оберіть банк" });
  const match = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ error: "Прикріпіть скрін у форматі PNG, JPG або WebP" });
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Розмір скріну має бути до 5 МБ" });
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const name = `payment-${order.id}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
  const dir = path.resolve(process.cwd(), "public/uploads/payments");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), data, { flag: "wx" });
  const url = `/uploads/payments/${name}`;
  await pool.query("UPDATE orders SET payment_proof_url=$1, payment_proof_at=NOW(), payment_status='proof_submitted' WHERE id=$2", [url, order.id]);
  await logActivity({ actorType: "guest", actorName: `Замовлення #${order.id}`, action: "Надіслав скрін передоплати", entityType: "order", entityId: order.id, details: { paymentAmount: order.payment_amount } });
  res.status(201).json({ ok: true, proofUrl: url });
}));
