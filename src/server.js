import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool, createPool } from "./db/pool.js";
import { initDatabase } from "./db/init.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { accountRouter } from "./routes/account.js";
import { startTelegramBot } from "./telegram/bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);
app.use("/api/account", accountRouter);

// Local product media is intentionally kept inside the public directory so its URL
// can be stored in the existing image_url column without another media service.
app.post("/api/admin/upload", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Потрібна авторизація" });
  try {
    const jwt = await import("jsonwebtoken");
    jwt.default.verify(token, process.env.JWT_SECRET || "icore-dev-secret-change-in-production");
    const dataUrl = String(req.body?.dataUrl || "");
    const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: "Оберіть зображення PNG, JPG або WebP" });
    const data = Buffer.from(match[2], "base64");
    if (!data.length || data.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Розмір фото має бути до 5 МБ" });
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const dir = path.join(__dirname, "../public/uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), data, { flag: "wx" });
    res.status(201).json({ url: `/uploads/${name}` });
  } catch {
    res.status(401).json({ error: "Сесію завершено" });
  }
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/index.html"));
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

async function resolvePort(preferred) {
  for (let port = preferred; port < preferred + 40; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error("Немає вільного порту");
}

function openBrowser(url) {
  if (process.env.OPEN_BROWSER === "0") return;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
}

async function start() {
  await createPool();
  await initDatabase();

  const preferred = Number(process.env.PORT) || 3000;
  const port = await resolvePort(preferred);
  const shopUrl = `http://localhost:${port}`;
  const adminUrl = `${shopUrl}/admin/login.html`;

  app.listen(port, "0.0.0.0", () => {
    console.log("");
    console.log("  iCore Store запущено");
    console.log(`  Магазин:  ${shopUrl}`);
    console.log(`  Адмінка:  ${adminUrl}`);
    console.log(`  Логін:    ${process.env.ADMIN_EMAIL || "admin@icore.store"}`);
    console.log(`  Пароль:   ${process.env.ADMIN_PASSWORD || "Admin123!"}`);
    console.log("");
    openBrowser(shopUrl);
    startTelegramBot().catch((error) => {
      console.error("Не вдалося запустити Telegram-бота:", error.message);
    });
  });
}

start().catch((error) => {
  console.error("Не вдалося запустити сервер:", error);
  process.exit(1);
});
