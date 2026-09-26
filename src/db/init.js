import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  old_price INTEGER,
  color TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  total INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_users (
  chat_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_cart (
  chat_id BIGINT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (chat_id, product_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  unsubscribe_token TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS site_content (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  selector TEXT NOT NULL,
  property TEXT NOT NULL DEFAULT 'text',
  value TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(path, selector, property)
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_import_runs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS system_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON activity_log (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_active_idx ON newsletter_subscribers (is_active);
CREATE INDEX IF NOT EXISTS site_content_path_idx ON site_content (path);
CREATE INDEX IF NOT EXISTS product_reviews_product_status_idx ON product_reviews (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS catalog_import_runs_source_idx ON catalog_import_runs (source, started_at DESC);
`;

async function ensureColumn(table, column, definition) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export async function initDatabase() {
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }

  await ensureColumn("orders", "telegram_chat_id", "telegram_chat_id BIGINT");
  await ensureColumn("products", "telegram_file_id", "telegram_file_id TEXT NOT NULL DEFAULT ''");
  await ensureColumn(
    "orders",
    "customer_id",
    "customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL"
  );
  await ensureColumn("orders", "payment_status", "payment_status TEXT NOT NULL DEFAULT 'awaiting_payment'");
  await ensureColumn("orders", "payment_provider", "payment_provider TEXT NOT NULL DEFAULT ''");
  await ensureColumn("orders", "payment_amount", "payment_amount INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("orders", "payment_receipt", "payment_receipt TEXT NOT NULL DEFAULT ''");
  await ensureColumn("orders", "payment_token", "payment_token TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text)");
  await ensureColumn("orders", "payment_proof_url", "payment_proof_url TEXT NOT NULL DEFAULT ''");
  await ensureColumn("orders", "payment_proof_at", "payment_proof_at TIMESTAMPTZ");
  await ensureColumn("products", "source", "source TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("products", "source_id", "source_id TEXT");
  await ensureColumn("products", "source_url", "source_url TEXT NOT NULL DEFAULT ''");
  await ensureColumn("products", "source_sku", "source_sku TEXT NOT NULL DEFAULT ''");
  await ensureColumn("products", "source_model", "source_model TEXT NOT NULL DEFAULT ''");
  await ensureColumn("products", "source_available", "source_available BOOLEAN NOT NULL DEFAULT TRUE");
  await ensureColumn("products", "source_price", "source_price INTEGER");
  await ensureColumn("products", "cost_price", "cost_price INTEGER");
  await pool.query("UPDATE products SET cost_price = source_price WHERE cost_price IS NULL AND source_price IS NOT NULL");
  await ensureColumn("products", "source_old_price", "source_old_price INTEGER");
  await ensureColumn("products", "markup_percent", "markup_percent NUMERIC(6,2) NOT NULL DEFAULT 0");
  await ensureColumn("products", "brand", "brand TEXT NOT NULL DEFAULT ''");
  await ensureColumn("products", "specifications", "specifications JSONB NOT NULL DEFAULT '{}'::jsonb");
  await ensureColumn("products", "images", "images JSONB NOT NULL DEFAULT '[]'::jsonb");
  await ensureColumn("products", "is_active", "is_active BOOLEAN NOT NULL DEFAULT TRUE");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS products_source_source_id_uidx ON products (source, source_id) WHERE source_id IS NOT NULL");

  const email = process.env.ADMIN_EMAIL || "admin@icore.store";
  const password = process.env.ADMIN_PASSWORD || "Admin123!";
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO admins (email, password_hash, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash, "Адміністратор iCore"]
  );

  const importCategories = [
    { slug: "iphone", name: "iPhone", sort_order: 1 },
    { slug: "airpods", name: "AirPods", sort_order: 2 },
    { slug: "mac", name: "Mac", sort_order: 3 },
  ];
  for (const category of importCategories) {
    await pool.query(
      `INSERT INTO categories (slug, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [category.slug, category.name, category.sort_order]
    );
  }

}

if (process.argv[1]?.endsWith("init.js")) {
  const { default: dotenv } = await import("dotenv");
  dotenv.config();
  try {
    const { createPool } = await import("./pool.js");
    await createPool();
    await initDatabase();
    console.log("База даних ініціалізована. Адмін:", process.env.ADMIN_EMAIL);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
