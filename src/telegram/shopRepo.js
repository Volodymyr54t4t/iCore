import { pool } from "../db/pool.js";

export async function upsertUser(from) {
  await pool.query(
    `INSERT INTO telegram_users (chat_id, username, first_name, last_name, last_seen_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (chat_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       last_seen_at = NOW()`,
    [from.id, from.username || null, from.first_name || "", from.last_name || ""]
  );
}

export async function isOwner(chatId) {
  const envIds = String(process.env.TELEGRAM_OWNER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (envIds.includes(String(chatId))) return true;
  const { rows } = await pool.query("SELECT is_owner FROM telegram_users WHERE chat_id = $1", [chatId]);
  return Boolean(rows[0]?.is_owner);
}

export async function grantOwner(chatId) {
  await pool.query("UPDATE telegram_users SET is_owner = TRUE WHERE chat_id = $1", [chatId]);
}

export async function listOwners() {
  const { rows } = await pool.query("SELECT chat_id FROM telegram_users WHERE is_owner = TRUE");
  const envIds = String(process.env.TELEGRAM_OWNER_IDS || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set([...rows.map((r) => Number(r.chat_id)), ...envIds])];
}

export async function listCustomers() {
  const { rows } = await pool.query("SELECT chat_id, username, first_name FROM telegram_users ORDER BY last_seen_at DESC");
  return rows;
}

export async function categories() {
  const { rows } = await pool.query("SELECT id, slug, name FROM categories ORDER BY sort_order, id");
  return rows;
}

export async function products({ categorySlug, q, featured = false, offset = 0, limit = 6 } = {}) {
  const params = [];
  const where = [];
  if (categorySlug) {
    params.push(categorySlug);
    where.push(`c.slug = $${params.length}`);
  }
  if (featured) {
    where.push("p.featured = TRUE");
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(p.name ILIKE $${params.length} OR p.tagline ILIKE $${params.length} OR p.description ILIKE $${params.length})`
    );
  }
  params.push(limit, offset);
  const sql = `
    SELECT p.*, c.slug AS category_slug, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.featured DESC, p.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function productById(id) {
  const { rows } = await pool.query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
     FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function cartItems(chatId) {
  const { rows } = await pool.query(
    `SELECT c.quantity, p.*
     FROM telegram_cart c
     JOIN products p ON p.id = c.product_id
     WHERE c.chat_id = $1
     ORDER BY p.name`,
    [chatId]
  );
  return rows;
}

export async function addToCart(chatId, productId, delta = 1) {
  const product = await productById(productId);
  if (!product) throw new Error("Товар не знайдено");
  const { rows } = await pool.query(
    "SELECT quantity FROM telegram_cart WHERE chat_id = $1 AND product_id = $2",
    [chatId, productId]
  );
  const current = rows[0]?.quantity || 0;
  const next = current + delta;
  if (next <= 0) {
    await pool.query("DELETE FROM telegram_cart WHERE chat_id = $1 AND product_id = $2", [chatId, productId]);
    return 0;
  }
  if (next > product.stock) throw new Error(`У наявності лише ${product.stock} шт.`);
  await pool.query(
    `INSERT INTO telegram_cart (chat_id, product_id, quantity)
     VALUES ($1,$2,$3)
     ON CONFLICT (chat_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [chatId, productId, next]
  );
  return next;
}

export async function clearCart(chatId) {
  await pool.query("DELETE FROM telegram_cart WHERE chat_id = $1", [chatId]);
}

export async function customerOrders(chatId) {
  const { rows } = await pool.query(
    "SELECT * FROM orders WHERE telegram_chat_id = $1 ORDER BY id DESC LIMIT 15",
    [chatId]
  );
  return rows;
}

export async function adminOrders(limit = 10, offset = 0) {
  const { rows } = await pool.query("SELECT * FROM orders ORDER BY id DESC LIMIT $1 OFFSET $2", [limit, offset]);
  return rows;
}

export async function setOrderStatus(id, status) {
  const { rows } = await pool.query("UPDATE orders SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
  return rows[0] || null;
}

export async function stats() {
  const [{ rows: products }, { rows: orders }, { rows: revenue }, { rows: users }, { rows: low }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM products"),
    pool.query("SELECT COUNT(*)::int AS count FROM orders"),
    pool.query("SELECT COALESCE(SUM(total),0)::int AS sum FROM orders WHERE status <> 'cancelled'"),
    pool.query("SELECT COUNT(*)::int AS count FROM telegram_users"),
    pool.query("SELECT COUNT(*)::int AS count FROM products WHERE stock <= 5"),
  ]);
  return {
    products: products[0].count,
    orders: orders[0].count,
    revenue: revenue[0].sum,
    users: users[0].count,
    lowStock: low[0].count,
  };
}

export async function lowStockProducts() {
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS category_name
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.stock <= 5 ORDER BY p.stock ASC, p.name`
  );
  return rows;
}

export async function updateStock(id, stock) {
  const { rows } = await pool.query(
    "UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [stock, id]
  );
  return rows[0] || null;
}

export async function updatePrice(id, price, oldPrice = null) {
  const { rows } = await pool.query(
    "UPDATE products SET price = $1, old_price = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
    [price, oldPrice, id]
  );
  return rows[0] || null;
}

export async function createProduct(data) {
  const slug =
    data.slug ||
    `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { rows } = await pool.query(
    `INSERT INTO products
      (category_id, slug, name, tagline, description, price, old_price, color, storage, stock, image_url, featured, telegram_file_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      data.categoryId,
      slug,
      data.name,
      data.tagline || "",
      data.description || "",
      data.price,
      data.oldPrice || null,
      data.color || "",
      data.storage || "",
      data.stock,
      data.imageUrl || "",
      Boolean(data.featured),
      data.telegramFileId || "",
    ]
  );
  return rows[0];
}

export async function deleteProduct(id) {
  const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [id]);
  return rowCount > 0;
}
