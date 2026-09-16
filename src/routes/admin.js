import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async.js";

export const adminRouter = Router();

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
  const [{ rows: products }, { rows: orders }, { rows: revenue }, { rows: recent }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM products"),
    pool.query("SELECT COUNT(*)::int AS count FROM orders"),
    pool.query("SELECT COALESCE(SUM(total),0)::int AS sum FROM orders WHERE status <> 'cancelled'"),
    pool.query("SELECT id, customer_name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 5"),
  ]);

  res.json({
    products: products[0].count,
    orders: orders[0].count,
    revenue: revenue[0].sum,
    recentOrders: recent,
  });
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
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Slug уже зайнятий" });
    res.status(400).json({ error: "Не вдалося оновити товар" });
  }
}));

adminRouter.delete("/products/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Товар не знайдено" });
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
  res.json(rows[0]);
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

const DB_TABLES = {
  admins: { label: "Адміністратори", pk: "id", columns: ["id", "email", "name", "created_at"], editable: ["email", "name"] },
  categories: { label: "Категорії", pk: "id", columns: ["id", "slug", "name", "sort_order"], editable: ["slug", "name", "sort_order"] },
  products: { label: "Товари", pk: "id", columns: ["id", "category_id", "slug", "name", "tagline", "description", "price", "old_price", "color", "storage", "stock", "image_url", "featured", "telegram_file_id", "created_at", "updated_at"], editable: ["category_id", "slug", "name", "tagline", "description", "price", "old_price", "color", "storage", "stock", "image_url", "featured", "telegram_file_id"] },
  orders: { label: "Замовлення", pk: "id", columns: ["id", "customer_name", "customer_phone", "customer_email", "city", "address", "notes", "status", "total", "telegram_chat_id", "customer_id", "created_at"], editable: ["customer_name", "customer_phone", "customer_email", "city", "address", "notes", "status", "telegram_chat_id", "customer_id"] },
  order_items: { label: "Позиції замовлень", pk: "id", columns: ["id", "order_id", "product_id", "product_name", "quantity", "price"], editable: ["order_id", "product_id", "product_name", "quantity", "price"] },
  telegram_users: { label: "Telegram користувачі", pk: "chat_id", columns: ["chat_id", "username", "first_name", "last_name", "is_owner", "created_at", "last_seen_at"], editable: ["username", "first_name", "last_name", "is_owner"] },
  telegram_cart: { label: "Кошики Telegram", pk: "chat_id", compositePk: ["chat_id", "product_id"], columns: ["chat_id", "product_id", "quantity"], editable: ["quantity"] },
  customers: { label: "Клієнти", pk: "id", columns: ["id", "email", "name", "phone", "city", "address", "created_at", "updated_at"], editable: ["email", "name", "phone", "city", "address"] },
};
const DB_FK = { category_id: ["categories", "id"], order_id: ["orders", "id"], product_id: ["products", "id"], customer_id: ["customers", "id"] };
const DB_TYPES = { id: "integer", category_id: "integer", order_id: "integer", product_id: "integer", customer_id: "integer", chat_id: "bigint", quantity: "integer", price: "integer", old_price: "integer", stock: "integer", sort_order: "integer", total: "integer", telegram_chat_id: "bigint", featured: "boolean", is_owner: "boolean", created_at: "date", updated_at: "date", last_seen_at: "date" };
function tableConfig(name) { return DB_TABLES[name]; }
function quoteIdentifier(value) { return `"${value.replaceAll('"', '""')}"`; }
function normalizeValue(column, value) {
  if (value === undefined || value === "") return null;
  if (DB_TYPES[column] === "boolean") return value === true || value === "true";
  if (["integer", "bigint"].includes(DB_TYPES[column])) return Number(value);
  return value;
}
function dbError(error) {
  if (error.code === "23505") return "Таке значення вже існує";
  if (error.code === "23503") return "Запис має пов’язані дані або посилається на неіснуючий запис";
  if (error.code === "23502") return "Заповніть усі обов’язкові поля";
  return "Операція з базою даних не виконана";
}

adminRouter.get("/db/meta", requireAdmin, asyncHandler(async (_req, res) => {
  const tables = Object.entries(DB_TABLES).map(([name, config]) => ({ name, ...config, columns: config.columns.map((column) => ({ name: column, type: DB_TYPES[column] || "text", nullable: !config.editable.includes(column) || column !== config.pk, foreignKey: DB_FK[column] || null, sensitive: column === "password_hash" })) }));
  res.json({ tables });
}));

adminRouter.get("/db/:table", requireAdmin, asyncHandler(async (req, res) => {
  const config = tableConfig(req.params.table);
  if (!config) return res.status(404).json({ error: "Таблицю не дозволено редагувати" });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const search = String(req.query.search || "").trim();
  const sort = config.columns.includes(req.query.sort) ? req.query.sort : config.pk;
  const direction = req.query.direction === "asc" ? "ASC" : "DESC";
  const values = [];
  const where = [];
  if (search) {
    const textColumns = config.columns.filter((column) => !["id", "chat_id", "product_id", "order_id", "customer_id", "quantity", "price", "stock", "sort_order", "total"].includes(column));
    if (textColumns.length) { values.push(`%${search}%`); where.push(`(${textColumns.map((column) => `CAST(${quoteIdentifier(column)} AS TEXT) ILIKE $${values.length}`).join(" OR ")})`); }
  }
  const prefix = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * limit;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`SELECT ${config.columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(req.params.table)}${prefix} ORDER BY ${quoteIdentifier(sort)} ${direction} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]),
    pool.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(req.params.table)}${prefix}`, values),
  ]);
  res.json({ rows, total: countRows[0].count, page, limit, sort, direction });
}));

async function dbWrite(req, res, method) {
  const config = tableConfig(req.params.table);
  if (!config) return res.status(404).json({ error: "Таблицю не дозволено редагувати" });
  const body = req.body || {};
  const fields = config.editable.filter((column) => Object.prototype.hasOwnProperty.call(body, column));
  if (!fields.length) return res.status(400).json({ error: "Немає дозволених полів для зміни" });
  try {
    let result;
    if (method === "insert") {
      const values = fields.map((field) => normalizeValue(field, body[field]));
      result = await pool.query(`INSERT INTO ${quoteIdentifier(req.params.table)} (${fields.map(quoteIdentifier).join(", ")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`, values);
    } else {
      const id = req.params.id;
      const values = fields.map((field) => normalizeValue(field, body[field]));
      values.push(id);
      result = await pool.query(`UPDATE ${quoteIdentifier(req.params.table)} SET ${fields.map((field, i) => `${quoteIdentifier(field)} = $${i + 1}`).join(", ")} WHERE ${quoteIdentifier(config.pk)} = $${values.length} RETURNING *`, values);
      if (!result.rows[0]) return res.status(404).json({ error: "Запис не знайдено" });
    }
    res.status(method === "insert" ? 201 : 200).json(result.rows[0]);
  } catch (error) { res.status(400).json({ error: dbError(error) }); }
}
adminRouter.post("/db/:table", requireAdmin, asyncHandler((req, res) => dbWrite(req, res, "insert")));
adminRouter.patch("/db/:table/:id", requireAdmin, asyncHandler((req, res) => dbWrite(req, res, "update")));
adminRouter.delete("/db/:table/:id", requireAdmin, asyncHandler(async (req, res) => {
  const config = tableConfig(req.params.table);
  if (!config || req.params.table === "admins") return res.status(400).json({ error: "Цю таблицю не можна видаляти через браузер" });
  try {
    const result = await pool.query(`DELETE FROM ${quoteIdentifier(req.params.table)} WHERE ${quoteIdentifier(config.pk)} = $1 RETURNING ${quoteIdentifier(config.pk)}`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Запис не знайдено" });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ error: dbError(error) }); }
}));
