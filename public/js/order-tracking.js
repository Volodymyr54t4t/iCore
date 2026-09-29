import { api, formatPrice, mountNav } from "./api.js";

const me = await mountNav();
const root = document.getElementById("order-tracking");
const params = new URLSearchParams(location.search);
const id = params.get("order");
const token = params.get("token");
let refreshTimer;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const date = (value) => value ? new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

function renderLookup() {
  clearTimeout(refreshTimer);
  const contactLookupForm = me ? "" : `<form class="tracking-lookup-form" id="order-lookup-form">
      <label>Email для оформлення<input name="email" type="email" autocomplete="email" placeholder="name@example.com" required maxlength="150" /></label>
      <label>Телефон для оформлення<input name="phone" type="tel" autocomplete="tel" placeholder="+380 00 000 00 00" required minlength="9" maxlength="24" /></label>
      <button class="btn" type="submit">Знайти мої замовлення <span>→</span></button>
      <p class="tracking-lookup-message" id="lookup-message" role="status">Для захисту даних потрібні обидва контакти, вказані під час покупки.</p>
    </form>`;
  root.innerHTML = `<section class="tracking-card tracking-lookup">
    <header class="tracking-head"><div><p class="cart-kicker">LONDÉ BY CVV · ОСОБИСТИЙ ТРЕКІНГ</p><h1>Ваші замовлення — під контролем.</h1><p>${me ? `Ви увійшли як ${escapeHtml(me.email)}. Тут зібрані всі ваші замовлення.` : "Знайдіть усі замовлення за email і телефоном, які вказували під час покупки."}</p></div><a href="/" class="tracking-home">До магазину →</a></header>
    ${contactLookupForm}
    ${me ? `<div class="tracking-account-load"><button class="btn" type="button" id="load-my-orders">Показати всі мої замовлення <span>→</span></button><p class="tracking-lookup-message" id="lookup-message" role="status">Список доступний лише після входу у ваш акаунт.</p></div>` : ""}
    <div id="lookup-results" aria-live="polite"></div>
  </section>`;

  const form = document.getElementById("order-lookup-form");
  const button = document.getElementById("load-my-orders") || form?.querySelector("button[type=submit]");
  async function searchOrders(event) {
    event?.preventDefault();
    const message = document.getElementById("lookup-message");
    const results = document.getElementById("lookup-results");
    button.disabled = true;
    button.textContent = "Шукаємо…";
    message.textContent = "Перевіряємо email і телефон.";
    results.innerHTML = "";
    try {
      const orders = await api("/api/orders/lookup", { method: "POST", body: form ? Object.fromEntries(new FormData(form).entries()) : {} });
      if (!orders.orders.length) {
        message.textContent = me ? "У вашому акаунті поки немає замовлень." : "Замовлень із цими контактами не знайдено. Перевірте, чи правильно ввели email і телефон.";
        return;
      }
      message.textContent = `Знайшли замовлень: ${orders.orders.length}. Відкрийте будь-яке, щоб подивитися етапи, склад і оплату.`;
      const statusNames = { new: "Очікує дзвінка", processing: "Підтверджено · в обробці", shipped: "Відправлено", done: "Доставлено", cancelled: "Скасовано" };
      const plural = (count) => count % 10 === 1 && count % 100 !== 11 ? "позиція" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "позиції" : "позицій";
      results.innerHTML = `<div class="tracking-order-list">${orders.orders.map((order) => {
        const count = Number(order.itemCount) || 0;
        return `<article class="tracking-order-card">
          <div><p class="cart-kicker">ЗАМОВЛЕННЯ №${escapeHtml(order.id)}</p><h2>${escapeHtml(statusNames[order.status] || order.status)}</h2><small>${date(order.createdAt)} · ${count} ${plural(count)}</small></div>
          <div class="tracking-order-total"><b>${formatPrice(order.total)}</b><a class="btn" href="${escapeHtml(order.trackingUrl)}">Відстежити <span>→</span></a></div>
        </article>`;
      }).join("")}</div>`;
    } catch (error) {
      message.textContent = error.message || "Не вдалося знайти замовлення. Спробуйте ще раз.";
    } finally {
      button.disabled = false;
      button.innerHTML = me ? "Показати всі мої замовлення <span>→</span>" : "Знайти мої замовлення <span>→</span>";
    }
  }
  if (form) form.addEventListener("submit", searchOrders);
  else button.addEventListener("click", searchOrders);
}

function render(order) {
  const cancelled = order.status === "cancelled";
  const paid = order.paymentStatus === "confirmed";
  const proofSubmitted = order.paymentStatus === "proof_submitted";
  const shipped = ["shipped", "done"].includes(order.status);
  const delivered = order.status === "done";
  const confirmed = order.status !== "new" && !cancelled;
  const steps = [
    { title: "Замовлення прийнято", detail: date(order.created_at) || "Ми отримали ваше замовлення" },
    { title: "Дзвінок менеджера", detail: confirmed ? `Підтверджено${order.confirmed_at ? ` · ${date(order.confirmed_at)}` : ""}` : "Менеджер зателефонує та звірить товар і доставку" },
    { title: "Оплата", detail: paid ? `Оплату підтверджено${order.paymentConfirmedAt ? ` · ${date(order.paymentConfirmedAt)}` : ""}` : proofSubmitted ? "Переказ перевіряє менеджер" : confirmed ? `Очікується передоплата ${formatPrice(order.paymentAmount)}` : "Стане доступна після підтвердження замовлення" },
    { title: "Відправлення", detail: delivered ? "Замовлення передано клієнту" : shipped ? "Замовлення відправлено" : "Підготуємо замовлення після оплати" },
    { title: "Доставлено", detail: delivered ? "Замовлення виконано" : "Фінальний етап" },
  ];
  const current = cancelled ? -1 : delivered ? 5 : shipped ? 4 : paid ? 3 : confirmed ? 2 : 1;
  root.innerHTML = `<section class="tracking-card">
    <header class="tracking-head"><div><p class="cart-kicker">LONDÉ BY CVV · ВІДСТЕЖЕННЯ</p><h1>Замовлення №${escapeHtml(order.id)}</h1><p>Останнє оновлення сторінки: ${date(new Date())}</p></div><a href="/track-order.html" class="tracking-home">← Усі мої замовлення</a></header>
    ${cancelled ? `<div class="tracking-cancelled">Замовлення скасовано. Якщо вважаєте, що це помилка, зателефонуйте нам: <a href="tel:+380671400008">+38 067 140 00 08</a>.</div>` : `<ol class="tracking-steps">${steps.map((step, index) => { const done = index < current; const active = index === current; return `<li class="${done ? "is-done" : ""} ${active ? "is-active" : ""}"><span class="tracking-dot">${done ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>${step.title}</b><small>${step.detail}</small></div></li>`; }).join("")}</ol>`}
    <section class="tracking-summary"><div><p class="cart-kicker">СКЛАД ЗАМОВЛЕННЯ</p>${order.items.map((item) => `<div class="tracking-item"><span>${escapeHtml(item.product_name)} <b>×${item.quantity}</b></span><strong>${formatPrice(item.price * item.quantity)}</strong></div>`).join("")}<div class="tracking-total"><span>Разом</span><b>${formatPrice(order.total)}</b></div></div><aside><p class="cart-kicker">ДОСТАВКА Й ОПЛАТА</p><p><b>Адреса</b><br />${escapeHtml(order.city)}, ${escapeHtml(order.address)}</p><p><b>Статус оплати</b><br />${escapeHtml(paid ? "Оплачено" : proofSubmitted ? "Переказ на перевірці" : confirmed ? "Очікується передоплата" : "Очікує дзвінка менеджера")}</p>${confirmed && !paid && !proofSubmitted ? `<a class="btn" href="/payment.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(token)}">Перейти до оплати <span>→</span></a>` : ""}</aside></section>
    <footer class="tracking-footer"><span>Сторінка оновлюється автоматично кожні 20 секунд.</span><button class="btn ghost" id="refresh-tracking">Оновити зараз</button></footer>
  </section>`;
  document.getElementById("refresh-tracking").onclick = load;
}

function showError(message) {
  clearTimeout(refreshTimer);
  root.innerHTML = `<section class="tracking-card tracking-error"><p class="cart-kicker">LONDÉ BY CVV</p><h1>Не вдалося знайти замовлення</h1><p>${escapeHtml(message)}</p><a class="btn" href="/track-order.html">Знайти свої замовлення</a></section>`;
}

async function load() {
  clearTimeout(refreshTimer);
  if (!id || !token) return showError("Перевірте приватне посилання для відстеження з підтвердження оформлення.");
  try {
    const order = await api(`/api/orders/${encodeURIComponent(id)}/tracking?token=${encodeURIComponent(token)}`);
    render(order);
    if (!["done", "cancelled"].includes(order.status)) refreshTimer = setTimeout(load, 20000);
  } catch (error) {
    showError(error.message);
  }
}

if (id && token) load();
else renderLookup();
