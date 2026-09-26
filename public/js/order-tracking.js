import { api, formatPrice, mountNav } from "./api.js";

await mountNav();
const root = document.getElementById("order-tracking");
const params = new URLSearchParams(location.search);
const id = params.get("order");
const token = params.get("token");
let refreshTimer;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const date = (value) => value ? new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

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
    <header class="tracking-head"><div><p class="cart-kicker">CVV ELECTRONICS · ВІДСТЕЖЕННЯ</p><h1>Замовлення №${escapeHtml(order.id)}</h1><p>Останнє оновлення сторінки: ${date(new Date())}</p></div><a href="/" class="tracking-home">До магазину →</a></header>
    ${cancelled ? `<div class="tracking-cancelled">Замовлення скасовано. Якщо вважаєте, що це помилка, зателефонуйте нам: <a href="tel:+380671400008">+38 067 140 00 08</a>.</div>` : `<ol class="tracking-steps">${steps.map((step, index) => { const done = index < current; const active = index === current; return `<li class="${done ? "is-done" : ""} ${active ? "is-active" : ""}"><span class="tracking-dot">${done ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>${step.title}</b><small>${step.detail}</small></div></li>`; }).join("")}</ol>`}
    <section class="tracking-summary"><div><p class="cart-kicker">СКЛАД ЗАМОВЛЕННЯ</p>${order.items.map((item) => `<div class="tracking-item"><span>${escapeHtml(item.product_name)} <b>×${item.quantity}</b></span><strong>${formatPrice(item.price * item.quantity)}</strong></div>`).join("")}<div class="tracking-total"><span>Разом</span><b>${formatPrice(order.total)}</b></div></div><aside><p class="cart-kicker">ДОСТАВКА Й ОПЛАТА</p><p><b>Адреса</b><br />${escapeHtml(order.city)}, ${escapeHtml(order.address)}</p><p><b>Статус оплати</b><br />${escapeHtml(paid ? "Оплачено" : proofSubmitted ? "Переказ на перевірці" : confirmed ? "Очікується передоплата" : "Очікує дзвінка менеджера")}</p>${confirmed && !paid && !proofSubmitted ? `<a class="btn" href="/payment.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(token)}">Перейти до оплати <span>→</span></a>` : ""}</aside></section>
    <footer class="tracking-footer"><span>Сторінка оновлюється автоматично кожні 20 секунд.</span><button class="btn ghost" id="refresh-tracking">Оновити зараз</button></footer>
  </section>`;
  document.getElementById("refresh-tracking").onclick = load;
}

function showError(message) {
  clearTimeout(refreshTimer);
  root.innerHTML = `<section class="tracking-card tracking-error"><p class="cart-kicker">CVV ELECTRONICS</p><h1>Не вдалося знайти замовлення</h1><p>${escapeHtml(message)}</p><a class="btn" href="/">Повернутися до магазину</a></section>`;
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

load();
