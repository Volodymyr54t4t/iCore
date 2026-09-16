import { api, formatPrice, getCart, saveCart, mountNav, toast } from "./api.js";

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

const me = await mountNav();

const cart = getCart();
const root = document.getElementById("checkout");

if (!cart.length) {
  root.innerHTML = `<div class="empty">Спочатку додайте товари. <a href="/">Каталог</a></div>`;
} else {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  root.innerHTML = `
    <p class="muted">До сплати: <b>${formatPrice(total)}</b> · ${cart.length} позицій</p>
    ${
      me
        ? `<p class="muted">Оформлюєте як <b>${me.name}</b>. Замовлення зʼявиться в кабінеті.</p>`
        : `<p class="muted">Маєте кабінет? <a href="/login.html?next=/checkout.html">Увійдіть</a> або <a href="/register.html?next=/checkout.html">зареєструйтесь</a>, щоб бачити історію замовлень.</p>`
    }
    <form class="form" id="form">
      <input name="name" required placeholder="Імʼя та прізвище" value="${escapeAttr(me?.name)}" />
      <input name="phone" required placeholder="Телефон" value="${escapeAttr(me?.phone)}" />
      <input name="email" type="email" required placeholder="Email" value="${escapeAttr(me?.email)}" ${me ? "readonly" : ""} />
      <input name="city" required placeholder="Місто" value="${escapeAttr(me?.city)}" />
      <input name="address" required placeholder="Відділення Нової Пошти або адреса" value="${escapeAttr(me?.address)}" />
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
      const extra = order.account
        ? `<a class="btn" href="/account.html">До кабінету</a>`
        : `<a class="btn ghost" href="/register.html?next=/account.html">Створити кабінет</a>`;
      root.innerHTML = `<div class="empty"><h2>Дякуємо!</h2><p>Замовлення №${order.id} прийнято. Сума ${formatPrice(order.total)}.</p><div class="row" style="justify-content:center;margin-top:16px"><a class="btn" href="/">На головну</a>${extra}</div></div>`;
      toast("Замовлення оформлено");
    } catch (error) {
      document.getElementById("error").textContent = error.message;
    }
  });
}
