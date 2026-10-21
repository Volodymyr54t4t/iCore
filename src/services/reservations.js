import crypto from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db/pool.js";
import { logActivity } from "./activity.js";

const ACTIVE = new Set(["new", "confirmed"]);
const ACCESS_TOKEN_RE = /^[a-f0-9]{48}$/;
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function validateContact(body = {}) {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const city = String(body.city || "").trim();
  const notes = String(body.notes || "").trim();
  if (name.length < 2 || name.length > 100) throw fail("Вкажіть ім’я (від 2 до 100 символів)");
  if (phone.length < 7 || phone.length > 40) throw fail("Вкажіть коректний номер телефону");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw fail("Вкажіть коректну email-адресу");
  if (city.length > 100 || notes.length > 1000) throw fail("Перевірте місто або коментар до бронювання");
  return { name, phone, email, city, notes };
}

export async function expireReservations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM reservations
      WHERE status IN ('new','confirmed') AND expires_at <= NOW()
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 250`);
    for (const reservation of rows) {
      if (reservation.stock_deducted && reservation.product_id) {
        await client.query("UPDATE products SET stock=stock+$1, updated_at=NOW() WHERE id=$2", [reservation.quantity, reservation.product_id]);
      }
      await client.query("UPDATE reservations SET status='expired', stock_deducted=FALSE, updated_at=NOW() WHERE id=$1", [reservation.id]);
      await logActivity({ actorType: "system", actorName: "Система", action: "Термін бронювання минув", entityType: "reservation", entityId: reservation.id, details: { quantity: reservation.quantity }, db: client });
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw error;
  } finally { client.release(); }
}

export async function createReservation(body) {
  const contact = validateContact(body);
  const productSlug = String(body.productSlug || "").trim();
  const quantity = Number(body.quantity ?? 1);
  const customerId = body.customerId != null && Number.isInteger(Number(body.customerId)) && Number(body.customerId) > 0 ? Number(body.customerId) : null;
  if (!/^[a-z0-9-]{1,180}$/i.test(productSlug)) throw fail("Оберіть товар для бронювання");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw fail("Кількість має бути від 1 до 10");
  await expireReservations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT p.*, c.slug AS category_slug
      FROM products p JOIN categories c ON c.id=p.category_id
      WHERE p.slug=$1 AND p.is_active=TRUE FOR UPDATE OF p`, [productSlug]);
    const product = rows[0];
    if (!product) throw fail("Товар не знайдено або він більше не доступний", 404);
    if (product.source === "jabko" ? !product.source_available : product.stock < quantity) {
      throw fail("На жаль, цієї кількості зараз немає в наявності", 409);
    }

    const accessToken = crypto.randomBytes(24).toString("hex");
    const expiresHours = 168;
    const stockDeducted = product.source !== "jabko";
    if (stockDeducted) await client.query("UPDATE products SET stock=stock-$1, updated_at=NOW() WHERE id=$2", [quantity, product.id]);
    const { rows: created } = await client.query(`INSERT INTO reservations
      (customer_id,product_id,product_name,product_slug,product_image,quantity,unit_price,stock_deducted,
       customer_name,customer_phone,customer_email,city,notes,access_token_hash,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()+($15::int * INTERVAL '1 hour')) RETURNING *`,
    [customerId, product.id, product.name, product.slug, product.image_url, quantity, product.price, stockDeducted,
      contact.name, contact.phone, contact.email, contact.city, contact.notes, tokenHash(accessToken), expiresHours]);
    const reservation = created[0];
    await logActivity({ actorType: customerId ? "customer" : "guest", actorId: customerId, actorName: contact.name, action: "Створив бронювання", entityType: "reservation", entityId: reservation.id, details: { product: product.name, quantity }, db: client });
    await client.query("COMMIT");
    return { id: reservation.id, accessToken, productName: product.name, quantity, unitPrice: product.price, total: product.price * quantity, expiresAt: reservation.expires_at, status: reservation.status };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw error;
  } finally { client.release(); }
}

export async function getCustomerReservation(id, token, customerId = null) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return null;
  if (customerId == null && !ACCESS_TOKEN_RE.test(String(token || ""))) return null;
  await expireReservations();
  const { rows } = await pool.query(`SELECT id,product_name,product_slug,product_image,quantity,unit_price,
    customer_name,customer_phone,customer_email,city,notes,status,expires_at,created_at,updated_at,
    signed_receipt_svg_url,signed_at FROM reservations
    WHERE id=$1 AND (($2::text IS NOT NULL AND access_token_hash=$2) OR ($3::int IS NOT NULL AND customer_id=$3))`, [id, token ? tokenHash(token) : null, customerId]);
  return rows[0] || null;
}

export async function cancelCustomerReservation(id, token, customerId = null) {
  if (customerId == null && !ACCESS_TOKEN_RE.test(String(token || ""))) throw fail("Посилання на бронювання некоректне", 404);
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw fail("Бронювання не знайдено", 404);
  await expireReservations();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM reservations WHERE id=$1
      AND (($2::text IS NOT NULL AND access_token_hash=$2) OR ($3::int IS NOT NULL AND customer_id=$3)) FOR UPDATE`, [id, token ? tokenHash(token) : null, customerId]);
    const reservation = rows[0];
    if (!reservation) throw fail("Бронювання не знайдено", 404);
    if (!ACTIVE.has(reservation.status)) throw fail("Це бронювання вже не можна скасувати", 409);
    if (reservation.stock_deducted && reservation.product_id) await client.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2", [reservation.quantity, reservation.product_id]);
    await client.query("UPDATE reservations SET status='cancelled',stock_deducted=FALSE,updated_at=NOW() WHERE id=$1", [id]);
    await logActivity({ actorType: customerId ? "customer" : "guest", actorId: customerId, actorName: reservation.customer_name, action: "Скасував бронювання", entityType: "reservation", entityId: reservation.id, db: client });
    await client.query("COMMIT");
    return { ok: true, status: "cancelled" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw error;
  } finally { client.release(); }
}

export async function listReservations() {
  await expireReservations();
  const { rows } = await pool.query(`SELECT r.*, p.stock AS current_stock
    FROM reservations r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.created_at DESC`);
  return rows;
}

export async function listCustomerReservations(customerId) {
  await expireReservations();
  const { rows } = await pool.query(`SELECT id,product_name,product_slug,product_image,quantity,unit_price,
    customer_name,customer_phone,customer_email,city,notes,status,expires_at,created_at,updated_at,
    signed_receipt_svg_url,signed_at FROM reservations
    WHERE customer_id=$1 ORDER BY created_at DESC`, [customerId]);
  return rows;
}

export async function cancelAccountReservation(id, customerId) {
  return cancelCustomerReservation(id, null, customerId);
}

function xmlEscape(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function signaturePaths(strokes) {
  if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > 100) throw fail("Спочатку намалюйте підпис");
  let pointsCount = 0;
  return strokes.map((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 1 || stroke.length > 500) throw fail("Формат підпису некоректний");
    pointsCount += stroke.length;
    if (pointsCount > 5000) throw fail("Підпис завеликий");
    const points = stroke.map((point) => {
      const x = Number(point?.x), y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw fail("Координати підпису некоректні");
      return [Math.round(x * 900), Math.round(y * 220)];
    });
    return `M${points[0][0]} ${points[0][1]}${points.slice(1).map(([x,y])=>` L${x} ${y}`).join("")}`;
  });
}

function receiptSvg(reservation, paths, signedAt) {
  const text = (x,y,value,size=24,weight=400,color="#242424") => `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${xmlEscape(value)}</text>`;
  const signature = paths.map((d)=>`<path d="${d}" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  const amount = new Intl.NumberFormat("uk-UA").format(Number(reservation.unit_price) * Number(reservation.quantity)) + " грн";
  const created = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(new Date(signedAt));
  const expires = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(new Date(reservation.expires_at));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1180" viewBox="0 0 900 1180"><rect width="900" height="1180" fill="#fff"/><rect x="0" y="0" width="900" height="15" fill="#d2ae68"/>${text(70,95,"LONDÉ BY CVV",28,700,"#171717")}${text(70,155,"КВИТАНЦІЯ ПРО БРОНЮВАННЯ",34,700)}${text(70,202,`Бронювання №${reservation.id}`,21,400,"#686868")}${text(70,246,`Створено: ${created}`,18,400,"#686868")}<path d="M70 280H830" stroke="#dedede"/>${text(70,342,"ТОВАР",16,700,"#888")}${text(70,385,reservation.product_name,26,700)}${text(70,430,`Кількість: ${reservation.quantity} шт.`,20)}${text(70,470,`Ціна за одиницю: ${new Intl.NumberFormat("uk-UA").format(reservation.unit_price)} грн`,20)}${text(70,525,`Разом: ${amount}`,25,700,"#171717")}<path d="M70 565H830" stroke="#dedede"/>${text(70,625,"ПОКУПЕЦЬ",16,700,"#888")}${text(70,670,`Ім’я: ${reservation.customer_name}`,20)}${text(70,710,`Телефон: ${reservation.customer_phone}`,20)}${text(70,750,`Email: ${reservation.customer_email}`,20)}${reservation.city?text(70,790,`Місто: ${reservation.city}`,20):""}${text(70,850,`Бронювання дійсне до: ${expires}`,19,700,"#171717")}${text(70,900,"ПІДПИС ПОКУПЦЯ",15,700,"#888")}<svg x="70" y="915" width="420" height="110" viewBox="0 0 900 220">${signature}</svg><path d="M70 1035H490" stroke="#777"/>${text(70,1075,`Підписано онлайн: ${created}`,16,400,"#686868")}${text(70,1135,"Документ підтверджує бронювання товару; він не є підтвердженням оплати.",15,400,"#777")}</svg>`;
}

export async function signReservation(id, { token = null, customerId = null, strokes }) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw fail("Бронювання не знайдено", 404);
  if (customerId == null && !ACCESS_TOKEN_RE.test(String(token || ""))) throw fail("Посилання на бронювання некоректне", 404);
  const paths = signaturePaths(strokes);
  const client = await pool.connect();
  let createdFiles = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM reservations WHERE id=$1
      AND (($2::text IS NOT NULL AND access_token_hash=$2) OR ($3::int IS NOT NULL AND customer_id=$3)) FOR UPDATE`, [id, token ? tokenHash(token) : null, customerId]);
    const reservation = rows[0];
    if (!reservation) throw fail("Бронювання не знайдено", 404);
    if (!ACTIVE.has(reservation.status) || reservation.expires_at <= new Date()) throw fail("Підписати можна лише чинне бронювання", 409);
    if (reservation.signed_at) throw fail("Квитанцію вже підписано", 409);
    const signedAt = new Date();
    const svg = receiptSvg(reservation, paths, signedAt);
    const dir = fileURLToPath(new URL("../../public/uploads/reservations/", import.meta.url));
    await mkdir(dir, { recursive: true });
    const base = `${reservation.id}-${crypto.randomBytes(8).toString("hex")}`;
    const svgName = `${base}.svg`;
    await writeFile(path.join(dir, svgName), svg, { flag: "wx" });
    createdFiles.push(path.join(dir, svgName));
    const svgUrl = `/uploads/reservations/${svgName}`;
    const { rows: updated } = await client.query(`UPDATE reservations SET signed_receipt_svg_url=$1,
      signed_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING signed_at`, [svgUrl, id]);
    await logActivity({ actorType: customerId ? "customer" : "guest", actorId: customerId, actorName: reservation.customer_name, action: "Підписав квитанцію бронювання", entityType: "reservation", entityId: Number(id), db: client });
    await client.query("COMMIT");
    return { signedReceiptSvgUrl: svgUrl, signedAt: updated[0].signed_at };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    for (const file of createdFiles) await unlink(file).catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function updateReservation(id, { status, managerNote, extendHours }, actorName = "Адміністратор") {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw fail("Бронювання не знайдено", 404);
  await expireReservations();
  const allowed = new Set(["new", "confirmed", "cancelled", "expired", "completed"]);
  if (status != null && !allowed.has(status)) throw fail("Невідомий статус бронювання");
  if (managerNote != null && (typeof managerNote !== "string" || managerNote.length > 1000)) throw fail("Коментар має бути до 1000 символів");
  if (extendHours != null && (!Number.isInteger(Number(extendHours)) || Number(extendHours) < 1 || Number(extendHours) > 720)) throw fail("Продовження має бути від 1 до 720 годин");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM reservations WHERE id=$1 FOR UPDATE", [id]);
    const reservation = rows[0];
    if (!reservation) throw fail("Бронювання не знайдено", 404);
    if (extendHours != null && reservation.signed_at) throw fail("Підписане бронювання не можна продовжити: квитанція підтверджує строк дії на момент підписання", 409);
    const nextStatus = status || reservation.status;
    if (reservation.status === "completed" && nextStatus !== "completed") throw fail("Завершене бронювання не можна змінити", 409);
    if (nextStatus === "completed" && !ACTIVE.has(reservation.status)) throw fail("Завершити можна лише активне бронювання", 409);
    if (extendHours != null && !ACTIVE.has(nextStatus)) throw fail("Продовжити строк можна лише для активного бронювання", 409);
    let deducted = reservation.stock_deducted;
    const reactivated = !ACTIVE.has(reservation.status) && ACTIVE.has(nextStatus);
    if (reactivated && reservation.signed_at) throw fail("Підписане бронювання не можна відновити. Створіть нове бронювання", 409);
    if (ACTIVE.has(reservation.status) && !ACTIVE.has(nextStatus) && nextStatus !== "completed" && deducted && reservation.product_id) {
      await client.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2", [reservation.quantity, reservation.product_id]);
      deducted = false;
    } else if (!ACTIVE.has(reservation.status) && ACTIVE.has(nextStatus) && reservation.product_id) {
      const { rows: products } = await client.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [reservation.product_id]);
      const product = products[0];
      if (!product || product.is_active !== true || (product.source === "jabko" ? !product.source_available : product.stock < reservation.quantity)) throw fail("Неможливо відновити бронювання: товару не вистачає", 409);
      if (product.source !== "jabko") {
        await client.query("UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2", [reservation.quantity, product.id]);
        deducted = true;
      }
    }
    const defaultHours = 24;
    const { rows: updated } = await client.query(`UPDATE reservations SET status=$1,
      stock_deducted=$2, manager_note=COALESCE($3,manager_note),
      expires_at=CASE WHEN $4::int IS NOT NULL THEN NOW()+($4::int * INTERVAL '1 hour')
        WHEN $5::boolean THEN NOW()+($6::int * INTERVAL '1 hour') ELSE expires_at END,
      updated_at=NOW() WHERE id=$7 RETURNING *`, [nextStatus, deducted, managerNote ?? null, extendHours == null ? null : Number(extendHours), reactivated, defaultHours, id]);
    await logActivity({ actorType: "admin", actorName, action: "Оновив бронювання", entityType: "reservation", entityId: Number(id), details: { status: nextStatus }, db: client });
    await client.query("COMMIT");
    return updated[0];
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw error;
  } finally { client.release(); }
}

export async function deleteReservation(id, actorName = "Адміністратор") {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw fail("Бронювання не знайдено", 404);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM reservations WHERE id=$1 FOR UPDATE", [id]);
    if (!rows[0]) throw fail("Бронювання не знайдено", 404);
    const reservation = rows[0];
    if (ACTIVE.has(reservation.status) && reservation.stock_deducted && reservation.product_id) {
      await client.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2", [reservation.quantity, reservation.product_id]);
    }
    await client.query("DELETE FROM reservations WHERE id=$1", [id]);
    await logActivity({ actorType: "admin", actorName, action: "Видалив бронювання", entityType: "reservation", entityId: Number(id), db: client });
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw error;
  } finally { client.release(); }
}
