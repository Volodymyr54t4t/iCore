import { Router } from "express";
import { pool } from "../db/pool.js";

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

publicRouter.get("/categories", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, name FROM categories ORDER BY sort_order, id"
  );
  res.json(rows);
});

publicRouter.get("/products", async (req, res) => {
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
});

publicRouter.get("/products/:slug", async (req, res) => {
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.slug = $1`, [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: "Товар не знайдено" });
  res.json(mapProduct(rows[0]));
});

publicRouter.post("/orders", async (req, res) => {
  const { name, phone, email, city, address, notes, items } = req.body || {};

  if (!name || !phone || !email || !city || !address || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Заповніть усі обовʼязкові поля та додайте товари" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let total = 0;
    const lines = [];

    for (const item of items) {
      const qty = Number(item.quantity);
      if (!item.id || !Number.isInteger(qty) || qty < 1) {
        throw new Error("Некоректний склад замовлення");
      }
      const { rows } = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [item.id]);
      const product = rows[0];
      if (!product) throw new Error("Один із товарів більше недоступний");
      if (product.stock < qty) throw new Error(`Недостатньо на складі: ${product.name}`);
      total += product.price * qty;
      lines.push({ product, qty });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_phone, customer_email, city, address, notes, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name.trim(), phone.trim(), email.trim(), city.trim(), address.trim(), (notes || "").trim(), total]
    );
    const order = orderResult.rows[0];

    for (const line of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, line.product.id, line.product.name, line.qty, line.product.price]
      );
      await client.query("UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2", [
        line.qty,
        line.product.id,
      ]);
    }

    await client.query("COMMIT");
    res.status(201).json({ id: order.id, total: order.total });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: error.message || "Не вдалося оформити замовлення" });
  } finally {
    client.release();
  }
});
