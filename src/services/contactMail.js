import nodemailer from "nodemailer";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isMailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.CONTACT_TO);
}

export async function sendContactMail({ name, email, phone, topic, message }) {
  if (!isMailConfigured()) throw new Error("Пошта для звернень ще не налаштована");

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || "true") !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const safe = Object.fromEntries(Object.entries({ name, email, phone, topic, message }).map(([key, value]) => [key, escapeHtml(value)]));
  const subject = `iCore · нове звернення: ${topic}`;
  await transporter.sendMail({
    from: `iCore Store <${process.env.SMTP_USER}>`,
    to: process.env.CONTACT_TO,
    replyTo: email,
    subject,
    text: `Нове звернення з сайту iCore\n\nТема: ${topic}\nІм’я: ${name}\nEmail: ${email}\nТелефон: ${phone || "Не вказано"}\n\nПовідомлення:\n${message}`,
    html: `
      <div style="max-width:620px;margin:0 auto;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f;background:#f6f6f8">
        <div style="padding:27px 28px;border-radius:22px 22px 0 0;color:#fff;background:linear-gradient(120deg,#124ec3,#402570)">
          <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#d5e0ff">iCore Store</div>
          <h1 style="margin:8px 0 0;font-size:27px;letter-spacing:-.04em">Нове звернення з сайту</h1>
        </div>
        <div style="padding:28px;background:#fff;border-radius:0 0 22px 22px">
          <p style="margin:0 0 22px;color:#6e6e73;font-size:13px">Тема: <strong style="color:#1d1d1f">${safe.topic}</strong></p>
          <table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:10px 0;border-top:1px solid #ececef;color:#6e6e73;width:35%">Ім’я</td><td style="padding:10px 0;border-top:1px solid #ececef;font-weight:600">${safe.name}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #ececef;color:#6e6e73">Email</td><td style="padding:10px 0;border-top:1px solid #ececef"><a href="mailto:${safe.email}" style="color:#0071e3">${safe.email}</a></td></tr><tr><td style="padding:10px 0;border-top:1px solid #ececef;color:#6e6e73">Телефон</td><td style="padding:10px 0;border-top:1px solid #ececef">${safe.phone || "Не вказано"}</td></tr></table>
          <div style="margin-top:22px;padding:17px;border-radius:13px;background:#f5f7fb;font-size:14px;line-height:1.55;white-space:pre-wrap">${safe.message}</div>
        </div>
      </div>`,
  });
}
