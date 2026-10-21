import { createMailTransporter, isSmtpConfigured } from "./contactMail.js";

const shopUrl = () => (process.env.SHOP_URL || "http://localhost:3000").replace(/\/$/, "");
const money = (value) => new Intl.NumberFormat("uk-UA").format(value) + " ₴";
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export async function sendOrderConfirmation(order) {
  if (!isSmtpConfigured()) return false;

  const receipt = order.receipt || order.payment_receipt || `IC-${String(order.id).padStart(6, "0")}`;
  const rows = (order.items || []).map((item) => {
    const name = escapeHtml(item.name || item.product_name);
    const quantity = Number(item.qty ?? item.quantity) || 1;
    const price = Number(item.price) || 0;
    return `<tr><td style="padding:15px 0;border-bottom:1px solid #eeeef2;font-weight:600">${name}<div style="margin-top:4px;color:#777780;font-size:13px;font-weight:400">${quantity} шт. × ${money(price)}</div></td><td style="padding:15px 0;border-bottom:1px solid #eeeef2;text-align:right;white-space:nowrap;font-weight:600">${money(quantity * price)}</td></tr>`;
  }).join("");
  const trackingUrl = `${shopUrl()}/track-order.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.paymentToken || order.payment_token || "")}`;
  const safeName = escapeHtml(order.customer_name || order.name);
  const subject = `Замовлення ${receipt} прийнято — LONDÉ BY CVV`;
  const text = `Вітаємо, ${order.customer_name || order.name}!\n\nДякуємо за замовлення ${receipt} у LONDÉ BY CVV. Ми вже отримали його та скоро зателефонуємо, щоб підтвердити наявність товару й доставку.\n\n${(order.items || []).map((item) => `${item.name || item.product_name} — ${item.qty ?? item.quantity} шт. × ${money(item.price)}`).join("\n")}\n\nРазом: ${money(order.total)}\nДоставка: ${order.city}, ${order.address}\n\nПереглянути статус: ${trackingUrl}\n\nЗ турботою, команда LONDÉ BY CVV`;
  const html = `<!doctype html><html><body style="margin:0;padding:28px 14px;background:#f3f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#191919"><div style="max-width:620px;margin:auto;overflow:hidden;border-radius:24px;background:#fff;box-shadow:0 16px 45px rgba(0,0,0,.08)"><div style="padding:32px 34px;background:#171717;color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:.18em;color:#d7c39d">LONDÉ BY CVV · APPLE TECHNOLOGY</div><h1 style="margin:22px 0 8px;font-size:32px;line-height:1.05;letter-spacing:-1.2px">Ваше замовлення<br>вже з нами.</h1><p style="margin:0;color:#dedede;font-size:15px;line-height:1.6">Дякуємо, ${safeName}. Ми подбаємо про все інше.</p></div><div style="padding:30px 34px"><div style="display:flex;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid #eeeef2;color:#74747b;font-size:13px"><span>НОМЕР ЗАМОВЛЕННЯ</span><b style="color:#191919">${escapeHtml(receipt)}</b></div><h2 style="margin:26px 0 8px;font-size:18px">Ваш вибір</h2><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table><div style="padding:19px 0;border-bottom:1px solid #eeeef2"><div style="display:flex;justify-content:space-between;font-size:17px;font-weight:700"><span>Разом</span><span>${money(order.total)}</span></div></div><h2 style="margin:24px 0 8px;font-size:16px">Доставка</h2><p style="margin:0;color:#55555d;font-size:14px;line-height:1.6">${escapeHtml(order.city)}, ${escapeHtml(order.address)}</p><p style="margin:4px 0 0;color:#777780;font-size:14px">${escapeHtml(order.customer_phone || order.phone)}</p><div style="margin-top:26px;padding:16px;border-radius:14px;background:#f5f4f1;color:#55555d;font-size:13px;line-height:1.6">Найближчим часом менеджер зателефонує, щоб підтвердити замовлення, наявність товару та деталі доставки. Оплата буде доступна після підтвердження.</div><a href="${trackingUrl}" style="display:inline-block;margin-top:22px;padding:14px 21px;border-radius:999px;background:#171717;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Відстежити замовлення&nbsp; →</a><p style="margin:28px 0 0;padding-top:17px;border-top:1px solid #eeeef2;color:#88888f;font-size:12px;line-height:1.6">Якщо маєте запитання — просто відповідайте на цей лист.\n<br>З турботою, команда LONDÉ BY CVV</p></div></div></body></html>`;

  await createMailTransporter().sendMail({
    from: `LONDÉ BY CVV <${process.env.SMTP_USER}>`,
    to: order.customer_email || order.email,
    subject,
    text,
    html,
  });
  return true;
}
