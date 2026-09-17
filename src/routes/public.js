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

export const publicRouter = Router();

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
