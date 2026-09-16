export function formatPrice(n) {
  return new Intl.NumberFormat("uk-UA").format(n) + " ₴";
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Помилка запиту");
  return data;
}

const CART_KEY = "icore-cart";

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

export function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find((i) => i.id === product.id);
  if (existing) existing.quantity += quantity;
  else {
    cart.push({
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      quantity,
    });
  }
  saveCart(cart);
}

export function cartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

export function updateCartBadge() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    const n = cartCount();
    el.textContent = n;
    el.hidden = n === 0;
  });
}

export function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 2200);
}

export function nav(active = "") {
  return `
    <header class="nav">
      <div class="nav-inner">
        <a class="logo" href="/"> iCore <span>Store</span></a>
        <nav class="nav-links">
          <a href="/#catalog">Каталог</a>
          <a href="/#iphone">iPhone</a>
          <a href="/#mac">Mac</a>
          <a href="/#watch">Watch</a>
          <a href="/admin/login.html">Адмін</a>
        </nav>
        <div class="nav-spacer"></div>
        <a class="cart-link" href="/cart.html">Кошик <b class="badge" data-cart-count hidden>0</b></a>
      </div>
    </header>
  `;
}
