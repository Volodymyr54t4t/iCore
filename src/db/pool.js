import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let pool;

function wrapPglite(client) {
  return {
    query: (text, params) => client.query(text, params),
    connect: async () => ({
      query: (text, params) => client.query(text, params),
      release() {},
    }),
  };
}

function prepareDatabaseUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("sslmode", "require");
  parsed.searchParams.delete("channel_binding");
  return parsed.toString();
}

async function connectPostgres(url) {
  const candidate = new pg.Pool({
    connectionString: prepareDatabaseUrl(url),
    max: 8,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: true },
  });
  await candidate.query("SELECT 1");
  return candidate;
}

async function connectPglite() {
  const dir = path.join(__dirname, "../../data");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(path.join(dir, "icore"));
  await client.waitReady;
  return wrapPglite(client);
}

export async function createPool() {
  const url = process.env.DATABASE_URL || "";
  const isPostgresUrl = url.startsWith("postgres://") || url.startsWith("postgresql://");
  const wantPostgres =
    isPostgresUrl && process.env.USE_POSTGRES !== "0" && process.env.USE_POSTGRES !== "false";

  if (wantPostgres) {
    try {
      pool = await connectPostgres(url);
      console.log("База даних: PostgreSQL (Neon)");
      return pool;
    } catch (error) {
      console.error("Не вдалося підключитися до PostgreSQL:", error.message);
      throw error;
    }
  }

  pool = await connectPglite();
  console.log("База даних: вбудована PostgreSQL (PGlite) → data/icore");
  return pool;
}
