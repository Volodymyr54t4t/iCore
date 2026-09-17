import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async.js";
import { logActivity } from "../services/activity.js";

export const adminRouter = Router();

async function audit(req, action, entityType, entityId = null, details = {}) {
  // A non-critical audit failure must never prevent a business operation such as
  // changing an order status from being saved.
  try {
    await logActivity({
      actorType: "admin",
      actorId: req.admin?.id,
      actorName: req.admin?.name || req.admin?.email || "Адміністратор",
      action,
      entityType,
      entityId,
      details,
    });
  } catch (error) {
    console.error("Не вдалося записати дію адміністратора:", error.message);
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
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
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
  };
}

adminRouter.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Вкажіть email і пароль" });
  }

  const { rows } = await pool.query("SELECT * FROM admins WHERE email = $1", [email.toLowerCase().trim()]);
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: "Невірний логін або пароль" });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET || "icore-dev-secret-change-in-production",
    { expiresIn: "7d" }
  );
  res.cookie("token", token, cookieOptions());
  res.json({ name: admin.name, email: admin.email });
}));

adminRouter.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

adminRouter.get("/me", requireAdmin, (req, res) => {
  res.json(req.admin);
});

adminRouter.get("/stats", requireAdmin, asyncHandler(async (_req, res) => {
  const [{ rows: products }, { rows: orders }, { rows: revenue }, { rows: customers }, { rows: lowStock }, { rows: recent }, { rows: chart }, { rows: statuses }, { rows: activity }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM products"),
    pool.query("SELECT COUNT(*)::int AS count FROM orders"),
    pool.query("SELECT COALESCE(SUM(total),0)::int AS sum FROM orders WHERE status <> 'cancelled'"),
    pool.query("SELECT COUNT(*)::int AS count FROM customers"),
    pool.query("SELECT COUNT(*)::int AS count FROM products WHERE stock <= 5"),
    pool.query("SELECT id, customer_name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 5"),
    pool.query(`SELECT TO_CHAR(day, 'DD Mon') AS label, COALESCE(SUM(total),0)::int AS total
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') day
      LEFT JOIN orders o ON o.created_at >= day AND o.created_at < day + INTERVAL '1 day' AND o.status <> 'cancelled'
      GROUP BY day ORDER BY day`),
    pool.query("SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status"),
    pool.query("SELECT * FROM activity_log ORDER BY id DESC LIMIT 7"),
  ]);

  res.json({
    products: products[0].count,
    orders: orders[0].count,
    revenue: revenue[0].sum,
    customers: customers[0].count,
    lowStock: lowStock[0].count,
    recentOrders: recent,
    chart,
    statuses,
    activity,
  });
}));

adminRouter.get("/activity", requireAdmin, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 200);
  const { rows } = await pool.query("SELECT * FROM activity_log ORDER BY id DESC LIMIT $1", [limit]);
  res.json(rows);
}));

adminRouter.get("/categories", requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`SELECT c.*, COUNT(p.id)::int AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.sort_order, c.id`);
  res.json(rows);
}));

adminRouter.post("/categories", requireAdmin, asyncHandler(async (req, res) => {
  const { name, slug, sortOrder = 0 } = req.body || {};
  if (!name?.trim() || !slug?.trim()) return res.status(400).json({ error: "Вкажіть назву та slug категорії" });
  try {
    const { rows } = await pool.query("INSERT INTO categories (name, slug, sort_order) VALUES ($1,$2,$3) RETURNING *", [name.trim(), slug.trim(), Number(sortOrder) || 0]);
    await audit(req, "Створив категорію", "category", rows[0].id, { name: rows[0].name });
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 400).json({ error: error.code === "23505" ? "Slug уже зайнятий" : "Не вдалося створити категорію" });
  }
}));

adminRouter.put("/categories/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { name, slug, sortOrder = 0 } = req.body || {};
  if (!name?.trim() || !slug?.trim()) return res.status(400).json({ error: "Вкажіть назву та slug категорії" });
  try {
    const { rows } = await pool.query("UPDATE categories SET name=$1, slug=$2, sort_order=$3 WHERE id=$4 RETURNING *", [name.trim(), slug.trim(), Number(sortOrder) || 0, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Категорію не знайдено" });
    await audit(req, "Оновив категорію", "category", rows[0].id, { name: rows[0].name });
    res.json(rows[0]);
  } catch (error) {
    res.status(error.code === "23505" ? 409 : 400).json({ error: error.code === "23505" ? "Slug уже зайнятий" : "Не вдалося оновити категорію" });
  }
}));

adminRouter.delete("/categories/:id", requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM categories WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Категорію не знайдено" });
    await audit(req, "Видалив категорію", "category", Number(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    res.status(409).json({ error: "Спершу перенесіть або видаліть товари з цієї категорії" });
  }
}));

adminRouter.get("/customers", requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`SELECT c.id, c.name, c.email, c.phone, c.city, c.address, c.created_at, c.updated_at,
    COUNT(o.id)::int AS orders_count, COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'),0)::int AS total_spent,
    MAX(o.created_at) AS last_order_at
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id ORDER BY c.created_at DESC`);
  res.json(rows);
}));

adminRouter.put("/customers/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { name, phone = "", city = "", address = "" } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Вкажіть імʼя клієнта" });
  const { rows } = await pool.query("UPDATE customers SET name=$1, phone=$2, city=$3, address=$4, updated_at=NOW() WHERE id=$5 RETURNING id,name,email,phone,city,address,created_at,updated_at", [name.trim(), phone.trim(), city.trim(), address.trim(), req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Клієнта не знайдено" });
  await audit(req, "Оновив профіль клієнта", "customer", rows[0].id, { name: rows[0].name });
  res.json(rows[0]);
}));

adminRouter.delete("/customers/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Клієнта не знайдено" });
  await audit(req, "Видалив клієнта", "customer", Number(req.params.id));
  res.json({ ok: true });
}));

adminRouter.get("/products", requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p JOIN categories c ON c.id = p.category_id
     ORDER BY p.id DESC`
  );
  res.json(rows.map(mapProduct));
}));

adminRouter.post("/products", requireAdmin, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const required = ["categoryId", "slug", "name", "price", "stock"];
  if (required.some((key) => body[key] === undefined || body[key] === "")) {
    return res.status(400).json({ error: "Заповніть обовʼязкові поля товару" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO products
        (category_id, slug, name, tagline, description, price, old_price, color, storage, stock, image_url, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        body.categoryId,
        String(body.slug).trim(),
        body.name.trim(),
        body.tagline || "",
        body.description || "",
        Number(body.price),
        body.oldPrice ? Number(body.oldPrice) : null,
        body.color || "",
        body.storage || "",
        Number(body.stock),
        body.imageUrl || "",
        Boolean(body.featured),
      ]
    );
    await audit(req, "Створив товар", "product", rows[0].id, { name: rows[0].name });
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Slug уже зайнятий" });
    res.status(400).json({ error: "Не вдалося зберегти товар" });
  }
}));

adminRouter.put("/products/:id", requireAdmin, asyncHandler(async (req, res) => {
  const body = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         category_id = $1, slug = $2, name = $3, tagline = $4, description = $5,
         price = $6, old_price = $7, color = $8, storage = $9, stock = $10,
         image_url = $11, featured = $12, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        body.categoryId,
        String(body.slug).trim(),
        body.name.trim(),
        body.tagline || "",
        body.description || "",
        Number(body.price),
        body.oldPrice ? Number(body.oldPrice) : null,
        body.color || "",
        body.storage || "",
        Number(body.stock),
        body.imageUrl || "",
        Boolean(body.featured),
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Товар не знайдено" });
    await audit(req, "Оновив товар", "product", rows[0].id, { name: rows[0].name });
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Slug уже зайнятий" });
    res.status(400).json({ error: "Не вдалося оновити товар" });
  }
}));

adminRouter.delete("/products/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Товар не знайдено" });
  await audit(req, "Видалив товар", "product", Number(req.params.id));
  res.json({ ok: true });
}));

adminRouter.get("/orders", requireAdmin, asyncHandler(async (_req, res) => {
  const { rows: orders } = await pool.query("SELECT * FROM orders ORDER BY id DESC");
  const { rows: items } = await pool.query("SELECT * FROM order_items ORDER BY id");
  const grouped = Object.fromEntries(orders.map((o) => [o.id, { ...o, items: [] }]));
  for (const item of items) {
    grouped[item.order_id]?.items.push(item);
  }
  res.json(Object.values(grouped));
}));

adminRouter.patch("/orders/:id", requireAdmin, asyncHandler(async (req, res) => {
  const allowed = ["new", "processing", "shipped", "done", "cancelled"];
  const { status } = req.body || {};
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Невідомий статус" });
  }
  const { rows } = await pool.query("UPDATE orders SET status = $1 WHERE id = $2 RETURNING *", [
    status,
    req.params.id,
  ]);
  if (!rows[0]) return res.status(404).json({ error: "Замовлення не знайдено" });
  await audit(req, "Змінив статус замовлення", "order", rows[0].id, { status });
  res.json({ ...rows[0], status });
}));

adminRouter.delete("/orders/:id", requireAdmin, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Замовлення не знайдено" });
    }

    const { rows: items } = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [req.params.id]
    );
    for (const item of items) {
      if (!item.product_id) continue;
      await client.query(
        "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }

    await client.query("DELETE FROM orders WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    await audit(req, "Видалив замовлення", "order", Number(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: error.message || "Не вдалося видалити замовлення" });
  } finally {
    client.release();
  }
}));
