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
`;

const CATEGORIES = [
  { slug: "iphone", name: "iPhone", sort_order: 1 },
  { slug: "mac", name: "Mac", sort_order: 2 },
  { slug: "ipad", name: "iPad", sort_order: 3 },
  { slug: "watch", name: "Apple Watch", sort_order: 4 },
  { slug: "airpods", name: "AirPods", sort_order: 5 },
  { slug: "accessories", name: "Аксесуари", sort_order: 6 },
];

const PRODUCTS = [
  {
    category: "iphone",
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    tagline: "Титан. A18 Pro. Camera Control.",
    description:
      "iPhone 16 Pro з титановим корпусом, чипом A18 Pro та системою камер Pro з Camera Control. 6,3-дюймовий Super Retina XDR, Action Button і до 27 годин відтворення відео.",
    price: 54999,
    old_price: 57999,
    color: "Натуральний титан",
    storage: "256 ГБ",
    stock: 14,
    image_url:
      "https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "iphone",
    slug: "iphone-16-pro-max",
    name: "iPhone 16 Pro Max",
    tagline: "Найбільший дисплей Pro. Найдовша автономність.",
    description:
      "6,9-дюймовий Super Retina XDR, телеоб’єктив 5× і найдовший час роботи серед iPhone. Для тих, хто хоче максимум екрана та камери.",
    price: 64999,
    old_price: null,
    color: "Пустельний титан",
    storage: "256 ГБ",
    stock: 8,
    image_url:
      "https://images.unsplash.com/photo-1591337676887-a217a02060ba?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "iphone",
    slug: "iphone-16",
    name: "iPhone 16",
    tagline: "Camera Control. Чип A18. Яскраві кольори.",
    description:
      "Новий iPhone 16 з кнопкою Camera Control, чипом A18 і яскравим 6,1-дюймовим дисплеєм. Ідеальний щоденний смартфон Apple.",
    price: 37999,
    old_price: 39999,
    color: "Ультрамарин",
    storage: "128 ГБ",
    stock: 22,
    image_url:
      "https://images.unsplash.com/photo-1510557880182-3d4e3cb32409?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "iphone",
    slug: "iphone-16e",
    name: "iPhone 16e",
    tagline: "Сучасний iPhone. Доступна ціна.",
    description:
      "iPhone 16e з чипом A18, USB-C і класичним дизайном. Найдоступніший шлях у екосистему Apple без компромісів у швидкості.",
    price: 27999,
    old_price: null,
    color: "Білий",
    storage: "128 ГБ",
    stock: 31,
    image_url:
      "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
  {
    category: "mac",
    slug: "macbook-air-13-m4",
    name: "MacBook Air 13\" M4",
    tagline: "Тонкий. Тихий. На чипі M4.",
    description:
      "Новий MacBook Air 13\" на чипі M4: до 18 годин автономності, Liquid Retina 13,6\" і вага лише 1,24 кг. Для навчання, роботи та подорожей.",
    price: 52999,
    old_price: 55999,
    color: "Sky Blue",
    storage: "16/256 ГБ",
    stock: 11,
    image_url:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "mac",
    slug: "macbook-pro-14-m4",
    name: "MacBook Pro 14\" M4",
    tagline: "Pro-продуктивність. Liquid Retina XDR.",
    description:
      "MacBook Pro 14\" з чипом M4, дисплеєм Liquid Retina XDR, до 24 годин автономності та професійними портами Thunderbolt.",
    price: 79999,
    old_price: null,
    color: "Space Black",
    storage: "16/512 ГБ",
    stock: 7,
    image_url:
      "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "mac",
    slug: "imac-24-m4",
    name: "iMac 24\" M4",
    tagline: "Колір. Потужність. 4,5K Retina.",
    description:
      "iMac 24\" на чипі M4 з дисплеєм 4,5K Retina, камерою 12 Мп Center Stage і тонким корпусом. Готове робоче місце в одному пристрої.",
    price: 69999,
    old_price: null,
    color: "Синій",
    storage: "16/256 ГБ",
    stock: 5,
    image_url:
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
  {
    category: "ipad",
    slug: "ipad-pro-11-m4",
    name: "iPad Pro 11\" M4",
    tagline: "Неймовірно тонкий. Ultra Retina XDR.",
    description:
      "iPad Pro 11\" на чипі M4 з дисплеєм Ultra Retina XDR (Tandem OLED). Для ілюстрації, монтажу відео та роботи з Apple Pencil Pro.",
    price: 49999,
    old_price: 52999,
    color: "Space Black",
    storage: "256 ГБ",
    stock: 9,
    image_url:
      "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "ipad",
    slug: "ipad-air-13-m3",
    name: "iPad Air 13\" M3",
    tagline: "Потужний. Легкий. Великий екран.",
    description:
      "iPad Air 13\" на чипі M3 — баланс розміру та продуктивності. Підтримка Magic Keyboard і Apple Pencil Pro.",
    price: 39999,
    old_price: null,
    color: "Синій",
    storage: "128 ГБ",
    stock: 13,
    image_url:
      "https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
  {
    category: "watch",
    slug: "apple-watch-series-10",
    name: "Apple Watch Series 10",
    tagline: "Найтонший Apple Watch. Найбільший дисплей.",
    description:
      "Series 10 з Wide-Angle OLED, датчиком температури, оцінкою сну та швидкою зарядкою. Спорт, здоров’я та щоденні сповіщення на зап’ясті.",
    price: 19999,
    old_price: 21999,
    color: "Jet Black",
    storage: "46 мм GPS",
    stock: 18,
    image_url:
      "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "watch",
    slug: "apple-watch-ultra-2",
    name: "Apple Watch Ultra 2",
    tagline: "Для екстремальних умов.",
    description:
      "Титановий корпус, дисплей 3000 ніт, глибиномір і сирена. Ultra 2 створений для дайвінгу, трейлу та ультрамарафонів.",
    price: 39999,
    old_price: null,
    color: "Natural Titanium",
    storage: "49 мм GPS+Cellular",
    stock: 6,
    image_url:
      "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
  {
    category: "airpods",
    slug: "airpods-pro-2",
    name: "AirPods Pro 2",
    tagline: "Активне шумопоглинання нового рівня.",
    description:
      "AirPods Pro 2 з чипом H2, Adaptive Audio, Conversation Awareness і USB-C. До 30 годин прослуховування з футляром.",
    price: 10999,
    old_price: 12499,
    color: "Білий",
    storage: "USB-C",
    stock: 40,
    image_url:
      "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=1200&q=80",
    featured: true,
  },
  {
    category: "airpods",
    slug: "airpods-max",
    name: "AirPods Max",
    tagline: "Hi-Fi. Просторове аудіо. Алюміній.",
    description:
      "Накладні AirPods Max з активним шумопоглинанням, просторовим аудіо та преміальними матеріалами. Для кіно, музики та студії.",
    price: 24999,
    old_price: null,
    color: "Midnight",
    storage: "USB-C",
    stock: 4,
    image_url:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
  {
    category: "accessories",
    slug: "magsafe-charger",
    name: "Зарядний пристрій MagSafe",
    tagline: "Магнітна зарядка до 15 Вт.",
    description:
      "Офіційний MagSafe для iPhone: точне позиціювання, швидка бездротова зарядка та сумісність з чохлами MagSafe.",
    price: 1999,
    old_price: 2299,
    color: "Білий",
    storage: "15 Вт",
    stock: 50,
    image_url:
      "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
  {
    category: "accessories",
    slug: "apple-pencil-pro",
    name: "Apple Pencil Pro",
    tagline: "Стиснення. Обертання. Find My.",
    description:
      "Apple Pencil Pro для iPad Pro та iPad Air: жести стискання, гіроскоп, haptic feedback і пошук через Find My.",
    price: 6499,
    old_price: null,
    color: "Білий",
    storage: "USB-C",
    stock: 16,
    image_url:
      "https://images.unsplash.com/photo-1629131726692-1accd0c53ce0?auto=format&fit=crop&w=1200&q=80",
    featured: false,
  },
];

export async function initDatabase() {
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }

  const email = process.env.ADMIN_EMAIL || "admin@icore.store";
  const password = process.env.ADMIN_PASSWORD || "Admin123!";
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO admins (email, password_hash, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash, "Адміністратор iCore"]
  );

  for (const category of CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (slug, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [category.slug, category.name, category.sort_order]
    );
  }

  const { rows: cats } = await pool.query("SELECT id, slug FROM categories");
  const catMap = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  for (const product of PRODUCTS) {
    await pool.query(
      `INSERT INTO products
        (category_id, slug, name, tagline, description, price, old_price, color, storage, stock, image_url, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (slug) DO UPDATE SET
         category_id = EXCLUDED.category_id,
         name = EXCLUDED.name,
         tagline = EXCLUDED.tagline,
         description = EXCLUDED.description,
         price = EXCLUDED.price,
         old_price = EXCLUDED.old_price,
         color = EXCLUDED.color,
         storage = EXCLUDED.storage,
         stock = EXCLUDED.stock,
         image_url = EXCLUDED.image_url,
         featured = EXCLUDED.featured,
         updated_at = NOW()`,
      [
        catMap[product.category],
        product.slug,
        product.name,
        product.tagline,
        product.description,
        product.price,
        product.old_price,
        product.color,
        product.storage,
        product.stock,
        product.image_url,
        product.featured,
      ]
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
