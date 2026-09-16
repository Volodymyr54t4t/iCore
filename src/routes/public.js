import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/async.js";
import { createOrder } from "../services/orders.js";
import { notifyNewOrder } from "../telegram/bot.js";
import { readCustomer } from "../middleware/auth.js";

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
    res.status(201).json({ id: order.id, total: order.total, account: Boolean(customer) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Не вдалося оформити замовлення" });
  }
}));
