import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { cookieOptions, jwtSecret, requireCustomer } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async.js";
import { logActivity } from "../services/activity.js";

export const accountRouter = Router();

function publicCustomer(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    city: row.city,
    address: row.address,
  };
}

function signCustomer(row) {
  return jwt.sign(
    { role: "customer", id: row.id, email: row.email, name: row.name },
    jwtSecret(),
    { expiresIn: "30d" }
  );
}

function setCustomerCookie(res, row) {
  res.cookie("customer_token", signCustomer(row), cookieOptions());
}

async function attachPastOrders(customerId, email) {
  await pool.query(
    `UPDATE orders SET customer_id = $1
     WHERE customer_id IS NULL AND lower(customer_email) = lower($2)`,
    [customerId, email]
  );
}

async function ordersFor(customerId) {
  const { rows: orders } = await pool.query(
    "SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC",
    [customerId]
  );
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const { rows: items } = await pool.query(
    `SELECT oi.*, p.slug, p.image_url, p.stock
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ANY($1::int[])
     ORDER BY oi.id`,
    [ids]
  );
  const grouped = Object.fromEntries(orders.map((o) => [o.id, { ...o, items: [] }]));
  for (const item of items) {
    grouped[item.order_id]?.items.push({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      slug: item.slug,
      imageUrl: item.image_url,
      stock: item.stock,
    });
  }
  return Object.values(grouped);
}

accountRouter.post("/register", asyncHandler(async (req, res) => {
  const { name, email, password, phone, city, address } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Вкажіть імʼя, email і пароль" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Пароль має містити щонайменше 6 символів" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(String(password), 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO customers (email, password_hash, name, phone, city, address)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        normalizedEmail,
        hash,
        name.trim(),
        (phone || "").trim(),
        (city || "").trim(),
        (address || "").trim(),
      ]
    );
    const customer = rows[0];
    await attachPastOrders(customer.id, customer.email);
    await logActivity({ actorType: "customer", actorId: customer.id, actorName: customer.name, action: "Зареєструвався", entityType: "customer", entityId: customer.id });
    setCustomerCookie(res, customer);
    res.status(201).json(publicCustomer(customer));
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Цей email уже зареєстрований. Увійдіть у кабінет." });
    }
    res.status(400).json({ error: "Не вдалося створити кабінет" });
  }
}));

accountRouter.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Вкажіть email і пароль" });
  }

  const { rows } = await pool.query("SELECT * FROM customers WHERE email = $1", [
    email.trim().toLowerCase(),
  ]);
  const customer = rows[0];
  if (!customer || !(await bcrypt.compare(String(password), customer.password_hash))) {
    return res.status(401).json({ error: "Невірний email або пароль" });
  }

  await attachPastOrders(customer.id, customer.email);
  await logActivity({ actorType: "customer", actorId: customer.id, actorName: customer.name, action: "Увійшов у кабінет", entityType: "customer", entityId: customer.id });
  setCustomerCookie(res, customer);
  res.json(publicCustomer(customer));
}));

accountRouter.post("/logout", (_req, res) => {
  res.clearCookie("customer_token");
  res.json({ ok: true });
});

accountRouter.get("/me", requireCustomer, asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [req.customer.id]);
  if (!rows[0]) return res.status(401).json({ error: "Кабінет не знайдено" });
  res.json(publicCustomer(rows[0]));
}));

accountRouter.patch("/me", requireCustomer, asyncHandler(async (req, res) => {
  const { name, phone, city, address } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: "Вкажіть імʼя" });
  }
  const { rows } = await pool.query(
    `UPDATE customers SET
       name = $1, phone = $2, city = $3, address = $4, updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [(name || "").trim(), (phone || "").trim(), (city || "").trim(), (address || "").trim(), req.customer.id]
  );
  setCustomerCookie(res, rows[0]);
  await logActivity({ actorType: "customer", actorId: req.customer.id, actorName: rows[0].name, action: "Оновив профіль", entityType: "customer", entityId: req.customer.id });
  res.json(publicCustomer(rows[0]));
}));

accountRouter.patch("/password", requireCustomer, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Заповніть обидва поля пароля" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "Новий пароль має містити щонайменше 6 символів" });
  }

  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [req.customer.id]);
  const customer = rows[0];
  if (!customer || !(await bcrypt.compare(String(currentPassword), customer.password_hash))) {
    return res.status(400).json({ error: "Поточний пароль невірний" });
  }

  const hash = await bcrypt.hash(String(newPassword), 10);
  await pool.query("UPDATE customers SET password_hash = $1, updated_at = NOW() WHERE id = $2", [
    hash,
    customer.id,
  ]);
  await logActivity({ actorType: "customer", actorId: req.customer.id, actorName: customer.name, action: "Змінив пароль", entityType: "customer", entityId: req.customer.id });
  res.json({ ok: true });
}));

accountRouter.get("/orders", requireCustomer, asyncHandler(async (req, res) => {
  res.json(await ordersFor(req.customer.id));
}));

accountRouter.patch("/orders/:id/cancel", requireCustomer, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM orders WHERE id = $1 AND customer_id = $2 FOR UPDATE",
      [req.params.id, req.customer.id]
    );
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Замовлення не знайдено" });
    }
    if (order.status !== "new") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Скасувати можна лише нове замовлення" });
    }

    const { rows: items } = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [order.id]
    );
    for (const item of items) {
      if (!item.product_id) continue;
      await client.query("UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2", [
        item.quantity,
        item.product_id,
      ]);
    }
    await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
    await logActivity({ actorType: "customer", actorId: req.customer.id, actorName: req.customer.name || order.customer_name, action: "Скасував замовлення", entityType: "order", entityId: order.id, db: client });
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: error.message || "Не вдалося скасувати" });
  } finally {
    client.release();
  }
}));
