import { api, formatPrice, getCart, saveCart, mountNav, toast } from "./api.js";

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
const escapeHtml = (value) => escapeAttr(value).replace(/'/g, "&#39;");

const me = await mountNav();

const cart = getCart();
const root = document.getElementById("checkout");

if (!cart.length) {
  root.innerHTML = `<section class="checkout-empty"><span>CVV / CHECKOUT</span><div class="checkout-empty-icon">✓</div><h2>Спочатку оберіть свою техніку</h2><p>Додайте товари до кошика — і поверніться, щоб завершити оформлення.</p><a class="btn" href="/#catalog">Перейти до каталогу <b>→</b></a></section>`;
} else {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  root.innerHTML = `
    <div class="checkout-intro"><p class="cart-kicker">CVV ELECTRONICS · ОФОРМЛЕННЯ</p><h2>Завершимо <em>покупку.</em></h2><p>${me ? `Ви оформлюєте замовлення як <b>${escapeHtml(me.name)}</b>.` : `Маєте кабінет? <a href="/login.html?next=/checkout.html">Увійдіть</a> або продовжуйте як гість.`}</p><div class="checkout-steps"><span class="done"><i>✓</i> Кошик</span><b></b><span class="active"><i>02</i> Дані доставки</span><b></b><span><i>03</i> Дзвінок і оплата</span></div></div>
    <div class="checkout-layout"><form class="form checkout-form" id="form"><div class="checkout-form-heading"><span>01</span><div><h2>Контактні дані</h2><p>Заповніть інформацію для підтвердження замовлення.</p></div></div>
      <label>Імʼя та прізвище<input name="name" required autocomplete="name" placeholder="Як до вас звертатися" value="${escapeAttr(me?.name)}" /></label>
      <label>Телефон<input name="phone" required autocomplete="tel" placeholder="+38 0XX XXX XX XX" value="${escapeAttr(me?.phone)}" /></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="name@example.com" value="${escapeAttr(me?.email)}" ${me ? "readonly" : ""} /></label>
      <div class="checkout-form-heading checkout-delivery-heading"><span>02</span><div><h2>Доставка</h2><p>Куди надіслати ваше замовлення?</p></div></div>
      <label>Місто<input name="city" required autocomplete="address-level2" placeholder="Місто" value="${escapeAttr(me?.city)}" /></label>
      <label class="checkout-field-wide">Відділення Нової Пошти або адреса<input name="address" required autocomplete="street-address" placeholder="Наприклад, відділення № 12" value="${escapeAttr(me?.address)}" /></label>
      <label class="checkout-field-wide">Коментар до замовлення <small>необов’язково</small><textarea name="notes" rows="3" placeholder="Побажання щодо доставки"></textarea></label>
      <div class="checkout-submit checkout-field-wide"><p class="muted" id="error" role="status"></p><button class="btn" type="submit">Оформити замовлення <span>→</span></button><small>Менеджер зателефонує, перепитає деталі й підтвердить замовлення. Оплата буде доступна після дзвінка.</small></div>
    </form><aside class="checkout-summary"><p class="cart-kicker">ВАШЕ ЗАМОВЛЕННЯ · ${cart.reduce((s,i)=>s+i.quantity,0)} ПОЗИЦІЙ</p><h2>У кошику</h2><div class="checkout-lines">${cart.map((i)=>`<article><div class="checkout-thumb">${i.imageUrl?`<img src="${escapeAttr(i.imageUrl)}" alt="" />`:`<span>CVV</span>`}<i>${Number(i.quantity)||1}</i></div><div><b>${escapeHtml(i.name)}</b><small>${formatPrice(i.price)} · ${Number(i.quantity)||1} шт.</small></div><strong>${formatPrice(Number(i.price)*Number(i.quantity))}</strong></article>`).join("")}</div><div class="checkout-total"><span>Разом до сплати</span><b>${formatPrice(total)}</b></div><a class="checkout-back" href="/cart.html">← Повернутися до кошика</a><p class="checkout-safe"><span>⌑</span> Дані передаються захищеним з’єднанням</p></aside></div>
  `;

  document.getElementById("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.items = cart.map((i) => ({ id: i.id, quantity: i.quantity }));
    try {
      const order = await api("/api/orders", { method: "POST", body: payload });
      saveCart([]);
      root.innerHTML = `<section class="checkout-success"><div class="checkout-empty-icon">✓</div><p class="cart-kicker">CVV ELECTRONICS · ЗАМОВЛЕННЯ №${escapeHtml(order.id)}</p><h2>Замовлення прийнято</h2><p>Менеджер зателефонує за номером <b>${escapeHtml(payload.phone)}</b>, перепитає склад замовлення й адресу доставки. Після підтвердження тут з’явиться оплата.</p><a class="btn" href="${escapeAttr(order.paymentUrl)}">Стежити за замовленням <span>→</span></a></section>`;
      toast("Замовлення чекає підтвердження менеджера");
    } catch (error) {
      document.getElementById("error").textContent = error.message;
    }
  });
}
