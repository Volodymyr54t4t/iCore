import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pool, createPool } from "./db/pool.js";
import { initDatabase } from "./db/init.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

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
  });
}

start().catch((error) => {
  console.error("Не вдалося запустити сервер:", error);
  process.exit(1);
});
