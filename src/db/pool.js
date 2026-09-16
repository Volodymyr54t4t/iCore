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

async function connectPostgres(url) {
  const candidate = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 2000,
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
  const wantPostgres = process.env.USE_POSTGRES === "1" || process.env.USE_POSTGRES === "true";

  if (wantPostgres && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
    pool = await connectPostgres(url);
    console.log("База даних: PostgreSQL");
    return pool;
  }

  pool = await connectPglite();
  console.log("База даних: вбудована PostgreSQL (PGlite) → data/icore");
  return pool;
}
