import crypto from "node:crypto";
import { pool } from "../db/pool.js";
import { createMailTransporter, isSmtpConfigured } from "./contactMail.js";

const shopUrl = () => (process.env.SHOP_URL || "http://localhost:3000").replace(/\/$/, "");
const price = (value) => new Intl.NumberFormat("uk-UA").format(value) + " ₴";

export async function subscribeNewsletter(email) {
  const token = crypto.randomBytes(24).toString("hex");
  const { rows } = await pool.query(
    `INSERT INTO newsletter_subscribers (email, unsubscribe_token, is_active, unsubscribed_at)
     VALUES ($1, $2, TRUE, NULL)
     ON CONFLICT (email) DO UPDATE SET is_active = TRUE, unsubscribed_at = NULL
     RETURNING id`,
    [email.toLowerCase().trim(), token]
  );
  return rows[0];
}

function productEmail(product, kind, oldPrice) {
  const isPriceDrop = kind === "price-drop";
  const headline = isPriceDrop ? "Ціна стала ще приємнішою." : "У нас новинка.";
  const lead = isPriceDrop ? `Тепер ${price(product.price)} замість ${price(oldPrice)}.` : "Щойно додали пристрій, який може стати вашим наступним улюбленим.";
  return {
    subject: isPriceDrop ? `iCore · Ціна знижена: ${product.name}` : `iCore · Новинка: ${product.name}`,
    html: (unsubscribeUrl) => `
      <div style="margin:0;padding:28px 14px;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17171b">
        <div style="max-width:620px;margin:auto;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 18px 42px rgba(20,26,48,.12)">
          <div style="position:relative;padding:34px 34px 31px;overflow:hidden;color:#fff;background:linear-gradient(130deg,#0644b4,#25398b 58%,#492978)">
            <div style="font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#c9d7ff">iCore Store · Apple technology</div>
            <h1 style="max-width:420px;margin:18px 0 7px;font-size:36px;line-height:.98;letter-spacing:-1.8px">${headline}</h1>
            <p style="max-width:370px;margin:0;color:#d8e1ff;font-size:14px;line-height:1.55">${lead}</p>
            <div style="position:absolute;right:-54px;bottom:-87px;width:240px;height:240px;border:1px solid rgba(255,255,255,.23);border-radius:50%;box-shadow:0 0 0 28px rgba(255,255,255,.07),0 0 0 62px rgba(255,255,255,.035)"></div>
          </div>
          <div style="padding:29px 34px 32px">
            <table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="width:112px;vertical-align:top">${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:16px;background:#f1f1f4" />` : ""}</td><td style="vertical-align:top;padding-left:12px"><div style="margin:2px 0 5px;color:#707078;font-size:11px">${product.tagline || "Apple technology"}</div><div style="font-size:20px;font-weight:700;letter-spacing:-.6px">${product.name}</div><div style="margin-top:10px;color:#0071e3;font-size:21px;font-weight:700;letter-spacing:-.7px">${price(product.price)}${isPriceDrop ? `<span style="margin-left:7px;color:#9999a0;font-size:13px;font-weight:400;text-decoration:line-through">${price(oldPrice)}</span>` : ""}</div></td></tr></table>
            <a href="${shopUrl()}/product.html?slug=${encodeURIComponent(product.slug)}" style="display:inline-block;margin-top:27px;padding:13px 20px;border-radius:999px;background:#0071e3;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Переглянути пристрій&nbsp; →</a>
            <p style="margin:27px 0 0;padding-top:17px;border-top:1px solid #ececf0;color:#92929a;font-size:10px;line-height:1.5">Ви отримали цей лист, бо підписалися на новини iCore. <a href="${unsubscribeUrl}" style="color:#6c6c74">Відписатися від розсилки</a></p>
          </div>
        </div>
      </div>`,
  };
}

export async function notifySubscribers(product, kind, oldPrice = null) {
  if (!isSmtpConfigured()) return { sent: 0, skipped: true };
  const { rows: subscribers } = await pool.query("SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE is_active = TRUE");
  if (!subscribers.length) return { sent: 0 };
  const mail = productEmail(product, kind, oldPrice);
  const transporter = createMailTransporter();
  let sent = 0;
  for (const subscriber of subscribers) {
    await transporter.sendMail({
      from: `iCore Store <${process.env.SMTP_USER}>`,
      to: subscriber.email,
      subject: mail.subject,
      html: mail.html(`${shopUrl()}/api/newsletter/unsubscribe?token=${subscriber.unsubscribe_token}`),
    });
    sent += 1;
  }
  return { sent };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function newsletterMessageEmail({ subject, message }) {
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
  return {
    subject: `iCore · ${subject}`,
    text: `${subject}\n\n${message}`,
    html: (unsubscribeUrl) => `
      <div style="margin:0;padding:28px 14px;background:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17171b">
        <div style="max-width:620px;margin:auto;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 18px 42px rgba(20,26,48,.12)">
          <div style="padding:34px;color:#fff;background:linear-gradient(130deg,#0644b4,#25398b 58%,#492978)">
            <div style="font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#c9d7ff">iCore Store · Apple technology</div>
            <h1 style="margin:18px 0 0;font-size:31px;line-height:1.05;letter-spacing:-1.4px">${safeSubject}</h1>
          </div>
          <div style="padding:29px 34px 32px">
            <div style="font-size:15px;line-height:1.65;color:#3b3b43">${safeMessage}</div>
            <p style="margin:27px 0 0;padding-top:17px;border-top:1px solid #ececf0;color:#92929a;font-size:10px;line-height:1.5">Ви отримали цей лист, бо підписалися на новини iCore. <a href="${unsubscribeUrl}" style="color:#6c6c74">Відписатися від розсилки</a></p>
          </div>
        </div>
      </div>`,
  };
}

export async function sendNewsletterMessage({ subject, message, subscribers }) {
  if (!isSmtpConfigured()) throw new Error("SMTP-пошта ще не налаштована");
  if (!subscribers.length) return { sent: 0, failed: [] };

  const mail = newsletterMessageEmail({ subject, message });
  const transporter = createMailTransporter();
  let sent = 0;
  const failed = [];
  for (const subscriber of subscribers) {
    try {
      await transporter.sendMail({
        from: `iCore Store <${process.env.SMTP_USER}>`,
        to: subscriber.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html(`${shopUrl()}/api/newsletter/unsubscribe?token=${subscriber.unsubscribe_token}`),
      });
      sent += 1;
    } catch (error) {
      console.error(`Newsletter delivery to ${subscriber.email}:`, error.message);
      failed.push(subscriber.email);
    }
  }
  return { sent, failed };
}
