import { pool } from "../db/pool.js";
import { logActivity } from "./activity.js";

export async function createOrder({
  name,
  phone,
  email,
  city,
  address,
  notes,
  items,
  telegramChatId = null,
  customerId = null,
}) {
  if (!name || !phone || !email || !city || !address || !Array.isArray(items) || !items.length) {
    throw new Error("Заповніть усі обовʼязкові поля та додайте товари");
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
      `INSERT INTO orders
        (customer_name, customer_phone, customer_email, city, address, notes, total, telegram_chat_id, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        name.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        city.trim(),
        address.trim(),
        (notes || "").trim(),
        total,
        telegramChatId,
        customerId,
      ]
    );
    const order = orderResult.rows[0];

    if (customerId) {
      await client.query(
        `UPDATE customers SET
           name = $1, phone = $2, city = $3, address = $4, updated_at = NOW()
         WHERE id = $5`,
        [name.trim(), phone.trim(), city.trim(), address.trim(), customerId]
      );
    }

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

    await logActivity({
      actorType: customerId ? "customer" : telegramChatId ? "telegram" : "guest",
      actorId: customerId,
      actorName: name.trim(),
      action: "Створив замовлення",
      entityType: "order",
      entityId: order.id,
      details: { total, items: lines.length },
      db: client,
    });

    await client.query("COMMIT");
    return { ...order, items: lines.map((l) => ({ name: l.product.name, qty: l.qty, price: l.product.price })) };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrderWithItems(id) {
  const { rows: orders } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  if (!orders[0]) return null;
  const { rows: items } = await pool.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [id]);
  return { ...orders[0], items };
}
