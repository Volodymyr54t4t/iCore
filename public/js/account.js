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
    return `<div class="empty">Замовлень ще немає. <a href="/">До каталогу</a></div>`;
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
      return `
        <article class="order-card">
          <div class="order-head">
            <div>
              <b>№${o.id}</b>
              <span class="status-pill status-${o.status}">${STATUS[o.status] || o.status}</span>
              <div class="muted">${when(o.created_at)}</div>
            </div>
            <div class="price">${formatPrice(o.total)}</div>
          </div>
          <p class="muted">${o.city}, ${o.address}${o.notes ? ` · ${o.notes}` : ""}</p>
          <ul>${items}</ul>
          <div class="row">
            ${canRepeat ? `<button class="btn ghost" data-repeat="${o.id}">Повторити</button>` : ""}
            ${canCancel ? `<button class="btn danger" data-cancel="${o.id}">Скасувати</button>` : ""}
          </div>
        </article>`;
    })
    .join("");
}

function renderProfile() {
  return `
    <form class="form" id="profile-form">
      <input name="name" required placeholder="Імʼя та прізвище" value="${me.name || ""}" />
      <input name="phone" placeholder="Телефон" value="${me.phone || ""}" />
      <input value="${me.email}" disabled />
      <input name="city" placeholder="Місто" value="${me.city || ""}" />
      <input name="address" placeholder="Адреса / відділення НП" value="${me.address || ""}" />
      <button class="btn">Зберегти дані</button>
      <div class="error" id="profile-error"></div>
    </form>
    <h3>Пароль</h3>
    <form class="form" id="password-form">
      <input name="currentPassword" type="password" required placeholder="Поточний пароль" />
      <input name="newPassword" type="password" required minlength="6" placeholder="Новий пароль" />
      <button class="btn ghost">Змінити пароль</button>
      <div class="error" id="password-error"></div>
    </form>
  `;
}

function render() {
  const s = stats();
  root.innerHTML = `
    <div class="account-head">
      <div>
        <h1 class="section-title">Вітаємо, ${me.name}</h1>
        <p class="muted">${me.email}</p>
      </div>
      <button class="btn ghost" id="logout">Вийти</button>
    </div>
    <div class="cards account-stats">
      <div class="stat-card"><span>Замовлень</span><b>${s.count}</b></div>
      <div class="stat-card"><span>Витрачено</span><b>${formatPrice(s.spent)}</b></div>
    </div>
    <div class="auth-tabs">
      <button class="chip ${tab === "orders" ? "active" : ""}" data-account-tab="orders">Замовлення</button>
      <button class="chip ${tab === "profile" ? "active" : ""}" data-account-tab="profile">Профіль і доставка</button>
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
