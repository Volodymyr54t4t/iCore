import { api, addToCart, formatPrice, mountNav, toast } from "./api.js";

const root = document.getElementById("account");
const STATUS = {
  new: "Нове",
  processing: "В обробці",
  shipped: "Відправлено",
  done: "Виконано",
  cancelled: "Скасовано",
};

function when(value) {
  return new Date(value).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });
}

let tab = "orders";
let orders = [];
const me = await mountNav();
if (!me) {
  location.replace("/login.html?next=/account.html");
}

function stats() {
  const active = orders.filter((o) => o.status !== "cancelled");
  const spent = active.reduce((s, o) => s + o.total, 0);
  return { count: orders.length, spent };
}

function renderOrders() {
  if (!orders.length) {
    return `<div class="account-empty"><div class="account-empty-icon">□</div><h2>Ще немає замовлень</h2><p>Саме час обрати свою наступну техніку Apple.</p><a class="btn" href="/#catalog">До каталогу <span>→</span></a></div>`;
  }
  return orders
    .map((o) => {
      const items = (o.items || [])
        .map(
          (i) =>
            `<li>${i.slug ? `<a href="/product.html?slug=${i.slug}">${i.name}</a>` : i.name} × ${i.quantity} — ${formatPrice(i.price * i.quantity)}</li>`
        )
        .join("");
      const canRepeat = (o.items || []).some((i) => i.productId && i.slug);
      const canCancel = o.status === "new";
      const paymentAction = o.payment_status !== "proof_submitted" && o.payment_status !== "confirmed" && o.payment_token
        ? `<a class="btn" href="/payment.html?order=${o.id}&token=${encodeURIComponent(o.payment_token)}">Передоплата 50%</a>`
        : o.payment_status === "proof_submitted" ? `<span class="status-pill status-processing">Скрін передоплати перевіряється</span>` : "";
      return `
        <article class="order-card account-order-card">
          <div class="order-head">
            <div>
              <p class="order-number">Замовлення №${o.id}</p>
              <span class="status-pill status-${o.status}">${STATUS[o.status] || o.status}</span>
              <div class="order-date">${when(o.created_at)}</div>
            </div>
            <div class="order-total"><span>Разом</span><b>${formatPrice(o.total)}</b></div>
          </div>
          <div class="order-meta"><span>⌖ ${o.city}, ${o.address}</span>${o.notes ? `<span>· ${o.notes}</span>` : ""}</div>
          <ul class="order-items">${items}</ul>
          <div class="order-actions">
            ${paymentAction}
            ${canRepeat ? `<button class="btn ghost" data-repeat="${o.id}">Повторити</button>` : ""}
            ${canCancel ? `<button class="btn danger" data-cancel="${o.id}">Скасувати</button>` : ""}
          </div>
        </article>`;
    })
    .join("");
}

function renderProfile() {
  return `
    <div class="profile-layout">
      <section class="profile-card">
        <div class="profile-card-head"><div><p class="account-kicker">Особисті дані</p><h2>Контактна інформація</h2></div><span class="profile-card-icon">●</span></div>
        <form class="profile-form" id="profile-form">
          <label class="profile-field"><span>Ім’я та прізвище</span><input name="name" required value="${me.name || ""}" /></label>
          <label class="profile-field"><span>Телефон</span><input name="phone" placeholder="+380" value="${me.phone || ""}" /></label>
          <label class="profile-field profile-field-wide"><span>Електронна пошта</span><input value="${me.email}" disabled /></label>
          <label class="profile-field"><span>Місто</span><input name="city" placeholder="Київ" value="${me.city || ""}" /></label>
          <label class="profile-field"><span>Адреса / відділення НП</span><input name="address" placeholder="Вкажіть адресу" value="${me.address || ""}" /></label>
          <div class="profile-form-footer"><div class="error" id="profile-error"></div><button class="btn">Зберегти зміни <span>→</span></button></div>
        </form>
      </section>
      <section class="password-card">
        <p class="account-kicker">Безпека</p><h2>Оновити пароль</h2><p>Регулярно оновлюйте пароль, щоб захистити свій акаунт.</p>
        <form class="password-form" id="password-form">
          <label class="profile-field"><span>Поточний пароль</span><input name="currentPassword" type="password" required /></label>
          <label class="profile-field"><span>Новий пароль</span><input name="newPassword" type="password" required minlength="6" /></label>
          <button class="btn ghost">Змінити пароль</button><div class="error" id="password-error"></div>
        </form>
      </section>
    </div>
  `;
}

function render() {
  const s = stats();
  root.innerHTML = `
    <section class="account-hero">
      <div class="account-hero-copy"><p class="account-kicker">Особистий простір</p><h1>Вітаємо, ${me.name || "друже"}.</h1><p>${me.email}</p></div>
      <div class="account-avatar" aria-hidden="true">${(me.name || "I").trim().charAt(0).toUpperCase()}</div>
      <button class="account-logout" id="logout">Вийти <span>↗</span></button>
    </section>
    <div class="account-stats">
      <div class="stat-card"><span>Усього замовлень</span><b>${s.count}</b><small>за весь час</small></div>
      <div class="stat-card"><span>Ваші покупки</span><b>${formatPrice(s.spent)}</b><small>без скасованих</small></div>
      <div class="stat-card stat-card-accent"><span>iCore клієнт</span><b>●</b><small>Дякуємо, що ви з нами</small></div>
    </div>
    <div class="account-tabs">
      <button class="chip ${tab === "orders" ? "active" : ""}" data-account-tab="orders">Замовлення</button>
      <button class="chip ${tab === "profile" ? "active" : ""}" data-account-tab="profile">Профіль і доставка <span>→</span></button>
    </div>
    <div id="tab">${tab === "orders" ? renderOrders() : renderProfile()}</div>
  `;
}

async function load() {
  try {
    orders = await api("/api/account/orders");
  } catch {
    orders = [];
  }
  render();
}

root.addEventListener("click", async (e) => {
  if (e.target.id === "logout") {
    await api("/api/account/logout", { method: "POST" });
    location.href = "/";
    return;
  }
  const tabBtn = e.target.closest("[data-account-tab]");
  if (tabBtn) {
    tab = tabBtn.dataset.accountTab;
    render();
    return;
  }
  const repeat = e.target.closest("[data-repeat]");
  if (repeat) {
    const order = orders.find((o) => String(o.id) === repeat.dataset.repeat);
    let added = 0;
    for (const item of order.items || []) {
      if (!item.productId || !item.slug) continue;
      addToCart(
        { id: item.productId, slug: item.slug, name: item.name, price: item.price, imageUrl: item.imageUrl || "" },
        item.quantity
      );
      added += 1;
    }
    toast(added ? "Товари додано в кошик" : "Ці позиції вже недоступні");
    if (added) location.href = "/cart.html";
    return;
  }
  const cancel = e.target.closest("[data-cancel]");
  if (cancel && confirm(`Скасувати замовлення №${cancel.dataset.cancel}?`)) {
    await api("/api/account/orders/" + cancel.dataset.cancel + "/cancel", { method: "PATCH" });
    toast("Замовлення скасовано");
    await load();
  }
});

root.addEventListener("submit", async (e) => {
  if (e.target.id === "profile-form") {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById("profile-error");
    errorEl.textContent = "";
    try {
      const updated = await api("/api/account/me", {
        method: "PATCH",
        body: {
          name: fd.get("name"),
          phone: fd.get("phone"),
          city: fd.get("city"),
          address: fd.get("address"),
        },
      });
      Object.assign(me, updated);
      toast("Дані збережено");
      await mountNav();
      render();
    } catch (error) {
      errorEl.textContent = error.message;
    }
  }
  if (e.target.id === "password-form") {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById("password-error");
    errorEl.textContent = "";
    try {
      await api("/api/account/password", {
        method: "PATCH",
        body: { currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword") },
      });
      e.target.reset();
      toast("Пароль змінено");
    } catch (error) {
      errorEl.textContent = error.message;
    }
  }
});

if (me) await load();

// Order statuses are changed by the administrator in a separate session.
// Refresh only while the customer is viewing this tab, without interrupting forms.
setInterval(async () => {
  if (!me || document.hidden || tab !== "orders") return;
  try {
    const fresh = await api("/api/account/orders");
    if (JSON.stringify(fresh.map((o) => [o.id, o.status])) !== JSON.stringify(orders.map((o) => [o.id, o.status]))) {
      orders = fresh;
      render();
      toast("Статус замовлення оновлено");
    }
  } catch {
    // The next scheduled refresh will retry; no need to distract the customer.
  }
}, 15000);
