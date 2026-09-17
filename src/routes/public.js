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

function mapProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    price: row.price,
    oldPrice: row.old_price,
    color: row.color,
    storage: row.storage,
    stock: row.stock,
    imageUrl: row.image_url,
    featured: row.featured,
    category: {
      id: row.category_id,
      slug: row.category_slug,
      name: row.category_name,
    },
  };
}

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

publicRouter.get("/categories", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, name FROM categories ORDER BY sort_order, id"
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
  const { category, q, sort, featured } = req.query;
  const params = [];
  const where = [];

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

  let order = "p.featured DESC, p.id DESC";
  if (sort === "price_asc") order = "p.price ASC";
  if (sort === "price_desc") order = "p.price DESC";
  if (sort === "name") order = "p.name ASC";

  const sql = `${PRODUCT_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order}`;
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(mapProduct));
}));

publicRouter.get("/products/:slug", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.slug = $1`, [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: "Товар не знайдено" });
  res.json(mapProduct(rows[0]));
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
      account: Boolean(customer),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Не вдалося оформити замовлення" });
  }
}));

async function paymentOrder(id, token) {
  const { rows } = await pool.query(
    `SELECT id, total, status, payment_status, payment_provider, payment_amount, payment_receipt,
            payment_proof_url, payment_proof_at, payment_token
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
  });
}));

publicRouter.patch("/orders/:id/payment-method", asyncHandler(async (req, res) => {
  const { token, provider } = req.body || {};
  if (!["monobank", "privatbank"].includes(provider)) return res.status(400).json({ error: "Оберіть банк для передоплати" });
  const order = await paymentOrder(req.params.id, token);
  if (!order) return res.status(404).json({ error: "Рахунок не знайдено" });
  if (order.payment_status === "proof_submitted" || order.payment_status === "confirmed") return res.status(400).json({ error: "Підтвердження оплати вже надіслано" });
  await pool.query("UPDATE orders SET payment_provider = $1 WHERE id = $2", [provider, order.id]);
  res.json({ ok: true, provider });
}));

publicRouter.post("/orders/:id/payment-proof", asyncHandler(async (req, res) => {
  const { token, dataUrl } = req.body || {};
  const order = await paymentOrder(req.params.id, token);
  if (!order) return res.status(404).json({ error: "Рахунок не знайдено" });
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
