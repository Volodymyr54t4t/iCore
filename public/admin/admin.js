const money = (n) => new Intl.NumberFormat("uk-UA").format(n) + " ₴";

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    location.href = "/admin/login.html";
    throw new Error("auth");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Помилка");
  return data;
}

const app = document.getElementById("app");
const modal = document.getElementById("modal");
let categories = [];
let view = location.hash.replace("#", "") || "dashboard";

const me = await api("/api/admin/me");
document.getElementById("who").textContent = me.email;
categories = await api("/api/categories");

document.getElementById("logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.href = "/admin/login.html";
});

document.querySelectorAll("[data-view]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    view = link.dataset.view;
    location.hash = view;
    document.querySelectorAll("[data-view]").forEach((a) => a.classList.toggle("active", a === link));
    render();
  });
});

function statusLabel(s) {
  return { new: "Нове", processing: "В обробці", shipped: "Відправлено", done: "Виконано", cancelled: "Скасовано" }[s] || s;
}

async function renderDashboard() {
  const stats = await api("/api/admin/stats");
  app.innerHTML = `
    <h2>Огляд</h2>
    <div class="cards">
      <div class="stat"><span>Товарів</span><b>${stats.products}</b></div>
      <div class="stat"><span>Замовлень</span><b>${stats.orders}</b></div>
      <div class="stat"><span>Виручка</span><b>${money(stats.revenue)}</b></div>
    </div>
    <h3>Останні замовлення</h3>
    <table>
      <thead><tr><th>№</th><th>Клієнт</th><th>Сума</th><th>Статус</th></tr></thead>
      <tbody>
        ${stats.recentOrders.map((o) => `<tr><td>${o.id}</td><td>${o.customer_name}</td><td>${money(o.total)}</td><td>${statusLabel(o.status)}</td></tr>`).join("") || `<tr><td colspan="4">Поки немає</td></tr>`}
      </tbody>
    </table>
  `;
}

function productForm(p = {}) {
  return `
    <div class="form-grid">
      <input name="name" required placeholder="Назва" value="${p.name || ""}" />
      <input name="slug" required placeholder="slug" value="${p.slug || ""}" />
      <select name="categoryId">${categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? "selected" : ""}>${c.name}</option>`).join("")}</select>
      <input name="price" type="number" required placeholder="Ціна ₴" value="${p.price || ""}" />
      <input name="oldPrice" type="number" placeholder="Стара ціна" value="${p.oldPrice || ""}" />
      <input name="stock" type="number" required placeholder="Склад" value="${p.stock ?? 0}" />
      <input name="color" placeholder="Колір" value="${p.color || ""}" />
      <input name="storage" placeholder="Конфігурація" value="${p.storage || ""}" />
      <input name="imageUrl" placeholder="URL зображення" value="${p.imageUrl || ""}" style="grid-column:1/-1" />
      <input name="tagline" placeholder="Короткий слоган" value="${p.tagline || ""}" style="grid-column:1/-1" />
      <textarea name="description" placeholder="Опис">${p.description || ""}</textarea>
      <label style="grid-column:1/-1"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""} /> Рекомендований</label>
    </div>
  `;
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    name: fd.get("name"),
    slug: fd.get("slug"),
    categoryId: Number(fd.get("categoryId")),
    price: Number(fd.get("price")),
    oldPrice: fd.get("oldPrice") ? Number(fd.get("oldPrice")) : null,
    stock: Number(fd.get("stock")),
    color: fd.get("color"),
    storage: fd.get("storage"),
    imageUrl: fd.get("imageUrl"),
    tagline: fd.get("tagline"),
    description: fd.get("description"),
    featured: form.querySelector("[name=featured]").checked,
  };
}

function openModal(html) {
  modal.classList.add("open");
  modal.innerHTML = `<div class="modal-card">${html}</div>`;
}

modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.dataset.close) modal.classList.remove("open");
});

async function renderProducts() {
  const products = await api("/api/admin/products");
  app.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2>Товари</h2>
      <button class="btn" id="add">Додати товар</button>
    </div>
    <table>
      <thead><tr><th>Назва</th><th>Категорія</th><th>Ціна</th><th>Склад</th><th></th></tr></thead>
      <tbody>
        ${products
          .map(
            (p) => `<tr>
              <td>${p.name}</td>
              <td>${p.categoryName}</td>
              <td>${money(p.price)}</td>
              <td>${p.stock}</td>
              <td>
                <button class="btn ghost" data-edit="${p.id}">Редагувати</button>
                <button class="btn danger" data-del="${p.id}">Видалити</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  document.getElementById("add").onclick = () => {
    openModal(`<h3>Новий товар</h3><form id="pf">${productForm()}<div style="margin-top:12px;display:flex;gap:8px"><button class="btn">Зберегти</button><button type="button" class="btn ghost" data-close>Скасувати</button></div><div class="error" id="ferr"></div></form>`);
    document.getElementById("pf").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/admin/products", { method: "POST", body: readForm(e.target) });
        modal.classList.remove("open");
        renderProducts();
      } catch (err) {
        document.getElementById("ferr").textContent = err.message;
      }
    };
  };

  app.onclick = async (e) => {
    const del = e.target.closest("[data-del]");
    const edit = e.target.closest("[data-edit]");
    if (del && confirm("Видалити товар?")) {
      await api("/api/admin/products/" + del.dataset.del, { method: "DELETE" });
      renderProducts();
    }
    if (edit) {
      const p = products.find((x) => String(x.id) === edit.dataset.edit);
      openModal(`<h3>Редагувати</h3><form id="pf">${productForm(p)}<div style="margin-top:12px;display:flex;gap:8px"><button class="btn">Оновити</button><button type="button" class="btn ghost" data-close>Скасувати</button></div><div class="error" id="ferr"></div></form>`);
      document.getElementById("pf").onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          await api("/api/admin/products/" + p.id, { method: "PUT", body: readForm(ev.target) });
          modal.classList.remove("open");
          renderProducts();
        } catch (err) {
          document.getElementById("ferr").textContent = err.message;
        }
      };
    }
  };
}

async function renderOrders() {
  const orders = await api("/api/admin/orders");
  app.innerHTML = `
    <h2>Замовлення</h2>
    ${orders
      .map(
        (o) => `
      <div class="stat" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <b>№${o.id}</b> · ${o.customer_name} · ${o.customer_phone}<br />
            <span style="color:#a1a1aa">${o.city}, ${o.address} · ${o.customer_email}</span>
          </div>
          <div>
            <div>${money(o.total)}</div>
            <select data-status="${o.id}">
              ${["new", "processing", "shipped", "done", "cancelled"].map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${statusLabel(s)}</option>`).join("")}
            </select>
          </div>
        </div>
        <ul>${o.items.map((i) => `<li>${i.product_name} × ${i.quantity} — ${money(i.price * i.quantity)}</li>`).join("")}</ul>
        ${o.notes ? `<p style="color:#a1a1aa">Коментар: ${o.notes}</p>` : ""}
      </div>`
      )
      .join("") || `<p>Замовлень ще немає</p>`}
  `;
  app.onchange = async (e) => {
    const sel = e.target.closest("[data-status]");
    if (!sel) return;
    await api("/api/admin/orders/" + sel.dataset.status, { method: "PATCH", body: { status: sel.value } });
  };
}

async function render() {
  document.querySelectorAll("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  if (view === "products") return renderProducts();
  if (view === "orders") return renderOrders();
  return renderDashboard();
}

await render();
