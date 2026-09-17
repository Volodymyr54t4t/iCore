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

export function showCartConfirmation(product, quantity = 1) {
  document.querySelector(".cart-feedback")?.remove();
  const feedback = document.createElement("aside");
  feedback.className = "cart-feedback";
  feedback.setAttribute("role", "status");
  feedback.innerHTML = `
    <div class="cart-feedback-mark">✓</div>
    ${product.imageUrl ? `<img src="${product.imageUrl}" alt="" />` : ""}
    <div class="cart-feedback-copy"><b>Додано до кошика</b><span>${product.name} · ${quantity} шт.</span></div>
    <a href="/cart.html">Переглянути <span>→</span></a>
    <button type="button" aria-label="Закрити повідомлення">×</button>
  `;
  document.body.appendChild(feedback);
  requestAnimationFrame(() => feedback.classList.add("is-visible"));
  const close = () => {
    feedback.classList.remove("is-visible");
    setTimeout(() => feedback.remove(), 260);
  };
  feedback.querySelector("button").addEventListener("click", close);
  setTimeout(close, 4800);
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

export async function getCustomer() {
  try {
    const res = await fetch("/api/account/me", { credentials: "include" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function nav(me = null) {
  const account = me
    ? `<a class="account-link" href="/account.html">Кабінет</a>`
    : `<a class="account-link" href="/login.html">Увійти</a>`;
  return `
    <header class="nav">
      <div class="nav-inner">
        <a class="logo" href="/"> iCore <span>Store</span></a>
        <nav class="nav-links">
          <a href="/#catalog">Каталог</a>
          <a href="/#iphone">iPhone</a>
          <a href="/#mac">Mac</a>
          <a href="/#watch">Watch</a>
          <a href="/about.html">Про iCore</a>
        </nav>
        <div class="nav-spacer"></div>
        ${account}
        <a class="cart-link" href="/cart.html">Кошик <b class="badge" data-cart-count hidden>0</b></a>
      </div>
    </header>
  `;
}

export async function mountNav() {
  const host = document.getElementById("nav");
  if (!host) return null;
  const me = await getCustomer();
  host.innerHTML = nav(me);
  updateCartBadge();
  return me;
}
