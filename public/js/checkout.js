import { api, formatPrice, getCart, saveCart, nav, updateCartBadge, toast } from "./api.js";

document.getElementById("nav").innerHTML = nav();
updateCartBadge();

const cart = getCart();
const root = document.getElementById("checkout");

if (!cart.length) {
  root.innerHTML = `<div class="empty">Спочатку додайте товари. <a href="/">Каталог</a></div>`;
} else {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  root.innerHTML = `
    <p class="muted">До сплати: <b>${formatPrice(total)}</b> · ${cart.length} позицій</p>
    <form class="form" id="form">
      <input name="name" required placeholder="Імʼя та прізвище" />
      <input name="phone" required placeholder="Телефон" />
      <input name="email" type="email" required placeholder="Email" />
      <input name="city" required placeholder="Місто" />
      <input name="address" required placeholder="Відділення Нової Пошти або адреса" />
      <textarea name="notes" rows="3" placeholder="Коментар (необовʼязково)"></textarea>
      <button class="btn">Підтвердити замовлення</button>
      <div class="muted" id="error"></div>
    </form>
  `;

  document.getElementById("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = cart.map((i) => ({ id: i.id, quantity: i.quantity }));
    try {
      const order = await api("/api/orders", { method: "POST", body: payload });
      saveCart([]);
      root.innerHTML = `<div class="empty"><h2>Дякуємо!</h2><p>Замовлення №${order.id} прийнято. Сума ${formatPrice(order.total)}.</p><a class="btn" href="/">На головну</a></div>`;
      toast("Замовлення оформлено");
    } catch (error) {
      document.getElementById("error").textContent = error.message;
    }
  });
}
