const macImage = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80";
const proImage = "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=1200&q=80";

export const MAC_CATEGORIES = [{ slug: "mac", name: "MacBook", sort_order: 1 }];

function mac({ slug, name, price, oldPrice = null, color, storage, chip, image = macImage, featured = false }) {
  return {
    category: "mac", slug, name,
    tagline: `${chip}. ${storage}. ${color}.`,
    description: `${name} — новий MacBook у конфігурації ${storage}, чип ${chip} та колір ${color}. Офіційна гарантія iCore та швидке відправлення.`,
    price, old_price: oldPrice, color, storage, stock: 8, image_url: image, featured,
  };
}

export const MAC_PRODUCTS = [
  mac({ slug: "macbook-neo-13-blush-256-a18pro", name: "MacBook Neo 13 Retina, Blush", price: 35699, oldPrice: 36999, color: "Blush", storage: "8GB / 256GB", chip: "A18 Pro · 6 CPU / 5 GPU", featured: true }),
  mac({ slug: "macbook-air-13-midnight-512-m5", name: "MacBook Air 13 Retina, Midnight", price: 73499, oldPrice: 77999, color: "Midnight", storage: "16GB / 512GB", chip: "Apple M5 · 10 CPU / 8 GPU", featured: true }),
  mac({ slug: "macbook-pro-14-m5-1tb-16-space-black", name: "MacBook Pro 14 M5, Space Black", price: 92999, oldPrice: 110999, color: "Space Black", storage: "16GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU", image: proImage, featured: true }),
  mac({ slug: "macbook-neo-13-citrus-256-a18pro", name: "MacBook Neo 13 Retina, Citrus", price: 34699, oldPrice: 36999, color: "Citrus", storage: "8GB / 256GB", chip: "A18 Pro · 6 CPU / 5 GPU" }),
  mac({ slug: "macbook-pro-16-m5-max-2tb-48-space-black", name: "MacBook Pro 16 M5 Max, Space Black", price: 225799, oldPrice: 269999, color: "Space Black", storage: "48GB / 2TB", chip: "Apple M5 Max · 18 CPU / 40 GPU", image: proImage, featured: true }),
  mac({ slug: "macbook-pro-14-m5-1tb-32-silver", name: "MacBook Pro 14 M5, Silver", price: 121999, oldPrice: 145999, color: "Silver", storage: "32GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU", image: proImage }),
  mac({ slug: "macbook-air-15-midnight-1tb-16-m5", name: "MacBook Air 15 Retina, Midnight", price: 87999, color: "Midnight", storage: "16GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU", featured: true }),
  mac({ slug: "macbook-pro-14-m5-512-16-space-black", name: "MacBook Pro 14 M5, Space Black, 512GB", price: 90499, oldPrice: 106999, color: "Space Black", storage: "16GB / 512GB", chip: "Apple M5 · 10 CPU / 10 GPU", image: proImage }),
  mac({ slug: "macbook-pro-16-m5-pro-1tb-24-space-black", name: "MacBook Pro 16 M5 Pro, Space Black", price: 142499, oldPrice: 168999, color: "Space Black", storage: "24GB / 1TB", chip: "Apple M5 Pro · 18 CPU / 20 GPU", image: proImage }),
  mac({ slug: "macbook-pro-16-m4-pro-512-24-silver", name: "MacBook Pro 16 M4 Pro, Silver", price: 122899, oldPrice: 135999, color: "Silver", storage: "24GB / 512GB", chip: "Apple M4 Pro · 14 CPU / 20 GPU", image: proImage }),
  mac({ slug: "macbook-air-13-sky-blue-512-16-m5", name: "MacBook Air 13 Retina, Sky Blue", price: 73499, oldPrice: 77999, color: "Sky Blue", storage: "16GB / 512GB", chip: "Apple M5 · 10 CPU / 8 GPU" }),
  mac({ slug: "macbook-neo-13-blush-512-a18pro", name: "MacBook Neo 13 Retina, Blush, 512GB", price: 40599, color: "Blush", storage: "8GB / 512GB", chip: "A18 Pro · 6 CPU / 5 GPU" }),
  mac({ slug: "macbook-pro-14-m5-1tb-32-silver-nano", name: "MacBook Pro 14 M5, Silver Nano-texture", price: 139599, color: "Silver", storage: "32GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU", image: proImage }),
  mac({ slug: "macbook-pro-14-m5-pro-1tb-64-silver", name: "MacBook Pro 14 M5 Pro, Silver", price: 198899, color: "Silver", storage: "64GB / 1TB", chip: "Apple M5 Pro · 18 CPU / 20 GPU", image: proImage }),
  mac({ slug: "macbook-pro-16-m5-pro-1tb-64-silver", name: "MacBook Pro 16 M5 Pro, Silver", price: 214399, color: "Silver", storage: "64GB / 1TB", chip: "Apple M5 Pro · 18 CPU / 20 GPU", image: proImage }),
  mac({ slug: "macbook-air-15-starlight-2tb-32-m4", name: "MacBook Air 15 Retina, Starlight", price: 111999, oldPrice: 120999, color: "Starlight", storage: "32GB / 2TB", chip: "Apple M4 · 10 CPU / 10 GPU" }),
  mac({ slug: "macbook-pro-14-m5-pro-1tb-48-space-black", name: "MacBook Pro 14 M5 Pro, Space Black", price: 178299, color: "Space Black", storage: "48GB / 1TB", chip: "Apple M5 Pro · 18 CPU / 20 GPU", image: proImage }),
  mac({ slug: "macbook-pro-14-m5-512-16-space-black-nano", name: "MacBook Pro 14 M5, Space Black Nano-texture", price: 98899, color: "Space Black", storage: "16GB / 512GB", chip: "Apple M5 · 10 CPU / 10 GPU", image: proImage }),
  mac({ slug: "macbook-air-13-silver-512-32-m5", name: "MacBook Air 13 Retina, Silver", price: 95799, color: "Silver", storage: "32GB / 512GB", chip: "Apple M5 · 10 CPU / 10 GPU" }),
  mac({ slug: "macbook-air-15-sky-blue-2tb-32-m4", name: "MacBook Air 15 Retina, Sky Blue, 2TB", price: 111999, color: "Sky Blue", storage: "32GB / 2TB", chip: "Apple M4 · 10 CPU / 10 GPU" }),
  mac({ slug: "macbook-pro-14-m5-1tb-24-space-black-nano", name: "MacBook Pro 14 M5, Space Black Nano-texture, 1TB", price: 129299, color: "Space Black", storage: "24GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU", image: proImage }),
  mac({ slug: "macbook-air-15-sky-blue-1tb-32-m5", name: "MacBook Air 15 Retina, Sky Blue, 1TB", price: 121599, color: "Sky Blue", storage: "32GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU" }),
  mac({ slug: "macbook-air-15-midnight-1tb-32-m5", name: "MacBook Air 15 Retina, Midnight, 32GB", price: 121599, color: "Midnight", storage: "32GB / 1TB", chip: "Apple M5 · 10 CPU / 10 GPU" }),
  mac({ slug: "macbook-pro-14-m5-max-2tb-64-space-black", name: "MacBook Pro 14 M5 Max, Space Black", price: 271199, color: "Space Black", storage: "64GB / 2TB", chip: "Apple M5 Max · 18 CPU / 40 GPU", image: proImage, featured: true }),
];
