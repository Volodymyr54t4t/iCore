import { api, formatPrice, getCart, saveCart, mountNav, toast, toggleFavorite } from "./api.js";

await mountNav();

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const escapeAttr = escapeHtml;
const root = document.getElementById("cart");
const catalog = new Map();
let refreshInProgress = false;

function normalizedCart() {
  return getCart().filter((item) => item && item.id && Number.isFinite(Number(item.price)) && Number(item.price) >= 0)
    .map((item) => ({ ...item, quantity: Math.max(1, Math.min(99, Math.trunc(Number(item.quantity) || 1))) }));
}

function render() {
  const cart = normalizedCart();
  const unavailable = cart.filter((item) => catalog.get(String(item.id))?.available === false).length;
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!cart.length) {
    root.innerHTML = `
      <section class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20.5 7H6.2"/><circle cx="9.5" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></svg></div>
        <p class="cart-kicker">Поки що тут тихо</p><h2>Кошик порожній</h2>
        <p>Оберіть техніку в каталозі. Тут можна перевірити наявність, змінити кількість і швидко перейти до оформлення.</p>
        <a class="btn cart-empty-action" href="/#catalog">Перейти до каталогу <span>→</span></a>
      </section>`;
    return;
  }

  root.innerHTML = `
    <div class="cart-layout">
      <section class="cart-products" aria-label="Товари в кошику">
        <div class="cart-products-head">
          <div><p class="cart-kicker">ВАШ ВИБІР</p><h2>Обрані товари <span>${itemCount}</span></h2><p>Ціни та наявність перевіряються за каталогом.</p></div>
          <button class="cart-clear" type="button" data-clear>Очистити кошик</button>
        </div>
        ${unavailable ? `<div class="cart-alert" role="status">${unavailable === 1 ? "Один товар" : `${unavailable} товари`} зараз недоступні. Видаліть ${unavailable === 1 ? "його" : "їх"}, щоб продовжити.</div>` : ""}
        <div class="cart-items">
          ${cart.map((item) => {
            const live = catalog.get(String(item.id));
            const unavailableItem = live?.available === false;
            const max = live?.stock > 0 ? Math.min(99, live.stock) : 99;
            return `<article class="cart-item${unavailableItem ? " is-unavailable" : ""}" data-item="${escapeAttr(item.id)}">
              <a class="cart-item-image" href="/product.html?slug=${encodeURIComponent(item.slug || "")}" aria-label="Переглянути ${escapeAttr(item.name)}">
                ${item.imageUrl ? `<img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.name)}" loading="lazy" />` : `<img class="cart-item-logo" src="/images/londe-logo.png" alt="" />`}
              </a>
              <div class="cart-item-info">
                <div class="cart-item-topline"><span class="cart-stock ${unavailableItem ? "is-out" : live?.available === true ? "is-in" : "is-checking"}">${unavailableItem ? "Немає в наявності" : live?.available === true ? "Є в наявності" : live ? "Не вдалося перевірити" : "Перевіряємо наявність…"}</span></div>
                <a class="cart-item-name" href="/product.html?slug=${encodeURIComponent(item.slug || "")}">${escapeHtml(item.name)}</a>
                <p class="cart-item-unit">${formatPrice(item.price)} <span>за одиницю</span></p>
                <div class="cart-item-actions">
                  <div class="quantity-control" aria-label="Кількість: ${escapeAttr(item.name)}">
                    <button type="button" data-adjust="${escapeAttr(item.id)}" data-delta="-1" aria-label="Зменшити кількість" ${item.quantity <= 1 ? "disabled" : ""}>−</button>
                    <input class="qty" type="number" min="1" max="${max}" value="${item.quantity}" inputmode="numeric" data-qty="${escapeAttr(item.id)}" aria-label="Кількість товару" />
                    <button type="button" data-adjust="${escapeAttr(item.id)}" data-delta="1" aria-label="Збільшити кількість" ${item.quantity >= max ? "disabled" : ""}>+</button>
                  </div>
                  <button class="cart-save-favorite" type="button" data-favorite="${escapeAttr(item.id)}">♡ <span>В обране</span></button>
                  <button class="remove-item" type="button" data-remove="${escapeAttr(item.id)}" aria-label="Видалити ${escapeAttr(item.name)} з кошика"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13"/></svg><span>Видалити</span></button>
                </div>
              </div>
              <p class="cart-item-total">${formatPrice(Number(item.price) * item.quantity)}</p>
            </article>`;
          }).join("")}
        </div>
        <div class="cart-assurances"><div><span aria-hidden="true">✓</span><p><b>Перевірка перед замовленням</b><small>Підсумкова ціна підтверджується менеджером</small></p></div><div><span aria-hidden="true">↗</span><p><b>Доставка за тарифами перевізника</b><small>Вартість залежить від міста та способу доставки</small></p></div></div>
      </section>
      <aside class="order-summary" aria-label="Підсумок замовлення">
        <p class="cart-kicker">ВАШЕ ЗАМОВЛЕННЯ</p><h2>Підсумок</h2>
        <div class="summary-row"><span>Товари <small>${itemCount} шт.</small></span><b>${formatPrice(total)}</b></div>
        <div class="summary-row"><span>Доставка</span><b class="summary-delivery">За тарифами перевізника</b></div>
        <div class="summary-total"><span>Разом за товари</span><b>${formatPrice(total)}</b></div>
        <a class="btn summary-checkout${unavailable ? " is-disabled" : ""}" ${unavailable ? 'aria-disabled="true"' : ""} href="${unavailable ? "#unavailable" : "/checkout.html"}">${unavailable ? "Приберіть недоступні товари" : "Перейти до оформлення"} <span>→</span></a>
        <p class="summary-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Замовлення підтверджується менеджером перед оплатою.</p>
        <a class="summary-continue" href="/#catalog">← Продовжити покупки</a>
      </aside>
    </div>`;
}

function updateQuantity(id, value) {
  const cart = normalizedCart();
  const item = cart.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  const live = catalog.get(String(id));
  const max = live?.stock > 0 ? Math.min(99, live.stock) : 99;
  item.quantity = Math.max(1, Math.min(max, Math.trunc(Number(value) || 1)));
  saveCart(cart);
  render();
}

async function refreshFromCatalog() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  const snapshot = normalizedCart();
  await Promise.all(snapshot.map(async (item) => {
    if (!item.slug) { catalog.set(String(item.id), { available: true }); return; }
    try {
      const product = await api(`/api/products/${encodeURIComponent(item.slug)}`);
      const live = { available: product.isAvailable !== false, stock: Number(product.stock) || 0 };
      catalog.set(String(item.id), live);
      item.name = product.name || item.name;
      item.price = Number(product.price);
      item.imageUrl = product.imageUrl || item.imageUrl;
      item.slug = product.slug || item.slug;
      if (live.stock > 0) item.quantity = Math.min(item.quantity, live.stock);
    } catch (error) {
      catalog.set(String(item.id), { available: error.message === "Товар не знайдено" ? false : null, stock: 0 });
    }
  }));
  const latestCart = normalizedCart();
  const refreshedById = new Map(snapshot.map((item) => [String(item.id), item]));
  for (const item of latestCart) {
    const refreshed = refreshedById.get(String(item.id));
    if (!refreshed) continue;
    const quantity = item.quantity;
    Object.assign(item, refreshed);
    item.quantity = catalog.get(String(item.id))?.stock > 0
      ? Math.min(quantity, catalog.get(String(item.id)).stock)
      : quantity;
  }
  saveCart(latestCart);
  refreshInProgress = false;
  render();
}

root.addEventListener("change", (event) => {
  const input = event.target.closest("[data-qty]");
  if (input) updateQuantity(input.dataset.qty, input.value);
});

root.addEventListener("keydown", (event) => {
  if (event.target.matches("[data-qty]") && event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
});

root.addEventListener("click", (event) => {
  const adjust = event.target.closest("[data-adjust]");
  if (adjust) {
    const item = normalizedCart().find((entry) => String(entry.id) === adjust.dataset.adjust);
    if (item) updateQuantity(item.id, item.quantity + Number(adjust.dataset.delta));
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    saveCart(normalizedCart().filter((item) => String(item.id) !== remove.dataset.remove));
    render();
    toast("Товар видалено з кошика");
    return;
  }
  const favorite = event.target.closest("[data-favorite]");
  if (favorite) {
    const item = normalizedCart().find((entry) => String(entry.id) === favorite.dataset.favorite);
    if (!item) return;
    toggleFavorite(item);
    saveCart(normalizedCart().filter((entry) => String(entry.id) !== favorite.dataset.favorite));
    render();
    toast("Товар збережено в обраному");
    return;
  }
  if (event.target.closest("[data-clear]")) {
    if (!window.confirm("Очистити весь кошик?")) return;
    saveCart([]);
    catalog.clear();
    render();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === "icore-cart") render();
});

render();
refreshFromCatalog();
