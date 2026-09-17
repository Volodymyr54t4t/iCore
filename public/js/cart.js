import { formatPrice, getCart, saveCart, mountNav } from "./api.js";

await mountNav();

function render() {
  const cart = getCart();
  const root = document.getElementById("cart");
  if (!cart.length) {
    root.innerHTML = `
      <section class="cart-empty">
        <div class="cart-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L20.5 7H6.2"/><circle cx="9.5" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></svg>
        </div>
        <p class="cart-kicker">Поки що тут тихо</p>
        <h2>Кошик порожній</h2>
        <p>Оберіть щось особливе у нашому каталозі — і ми допоможемо швидко оформити замовлення.</p>
        <a class="btn cart-empty-action" href="/#catalog">Перейти до каталогу <span>→</span></a>
      </section>`;
    return;
  }
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);
  root.innerHTML = `
    <div class="cart-layout">
      <section class="cart-products" aria-label="Товари в кошику">
        <div class="cart-products-head">
          <h2>Обрані товари <span>${itemCount}</span></h2>
          <p>Перевірте деталі перед оформленням.</p>
        </div>
        <div class="cart-items">
          ${cart.map((i) => `
            <article class="cart-item">
              <a class="cart-item-image" href="/product.html?slug=${i.slug}" aria-label="Переглянути ${i.name}">
                ${i.imageUrl ? `<img src="${i.imageUrl}" alt="${i.name}" />` : `<span>iCore</span>`}
              </a>
              <div class="cart-item-info">
                <a class="cart-item-name" href="/product.html?slug=${i.slug}">${i.name}</a>
                <p class="cart-item-unit">${formatPrice(i.price)} за одиницю</p>
                <div class="cart-item-actions">
                  <div class="quantity-control" aria-label="Кількість ${i.name}">
                    <button type="button" data-adjust="${i.id}" data-delta="-1" aria-label="Зменшити кількість">−</button>
                    <input class="qty" type="number" min="1" value="${i.quantity}" data-qty="${i.id}" aria-label="Кількість" />
                    <button type="button" data-adjust="${i.id}" data-delta="1" aria-label="Збільшити кількість">+</button>
                  </div>
                  <button class="remove-item" type="button" data-remove="${i.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13"/></svg>
                    <span>Прибрати</span>
                  </button>
                </div>
              </div>
              <p class="cart-item-total">${formatPrice(i.price * i.quantity)}</p>
            </article>`).join("")}
        </div>
        <div class="cart-assurances">
          <div><span aria-hidden="true">✓</span><p><b>Оригінальна техніка</b><small>Гарантія та офіційна комплектація</small></p></div>
          <div><span aria-hidden="true">↗</span><p><b>Швидке відправлення</b><small>Передамо замовлення перевізнику сьогодні</small></p></div>
        </div>
      </section>
      <aside class="order-summary">
        <p class="cart-kicker">Ваше замовлення</p>
        <h2>Підсумок</h2>
        <div class="summary-row"><span>Товари <small>${itemCount} шт.</small></span><b>${formatPrice(total)}</b></div>
        <div class="summary-row"><span>Доставка</span><b class="summary-free">Безкоштовно</b></div>
        <div class="summary-total"><span>Разом</span><b>${formatPrice(total)}</b></div>
        <a class="btn summary-checkout" href="/checkout.html">Оформити замовлення <span>→</span></a>
        <p class="summary-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Безпечне оформлення та захист ваших даних</p>
      </aside>
    </div>
  `;
}

document.getElementById("cart").addEventListener("input", (e) => {
  const input = e.target.closest("[data-qty]");
  if (!input) return;
  const cart = getCart();
  const item = cart.find((i) => String(i.id) === input.dataset.qty);
  item.quantity = Math.max(1, Number(input.value) || 1);
  saveCart(cart);
  render();
});

document.getElementById("cart").addEventListener("click", (e) => {
  const adjust = e.target.closest("[data-adjust]");
  if (adjust) {
    const cart = getCart();
    const item = cart.find((i) => String(i.id) === adjust.dataset.adjust);
    if (!item) return;
    item.quantity = Math.max(1, item.quantity + Number(adjust.dataset.delta));
    saveCart(cart);
    render();
    return;
  }
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  saveCart(getCart().filter((i) => String(i.id) !== btn.dataset.remove));
  render();
});

render();
