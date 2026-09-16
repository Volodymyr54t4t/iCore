import { api, formatPrice, addToCart, mountNav, toast } from "./api.js";

await mountNav();

const slug = new URLSearchParams(location.search).get("slug");
const page = document.getElementById("page");

try {
  const p = await api("/api/products/" + encodeURIComponent(slug));
  document.title = p.name + " — iCore Store";
  page.innerHTML = `
    <div class="product-layout">
      <div class="product-photo"><img src="${p.imageUrl}" alt="${p.name}" /></div>
      <div>
        <p class="muted">${p.category.name}</p>
        <h1 class="section-title">${p.name}</h1>
        <p>${p.tagline}</p>
        <p>${p.description}</p>
        <div class="price" style="font-size:28px;margin:18px 0">${formatPrice(p.price)}${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ""}</div>
        <div class="specs">
          <div>Колір: ${p.color || "—"}</div>
          <div>Конфігурація: ${p.storage || "—"}</div>
          <div>На складі: ${p.stock} шт.</div>
        </div>
        <div class="row" style="margin-top:24px">
          <button class="btn" id="buy" ${p.stock < 1 ? "disabled" : ""}>Додати в кошик</button>
          <a class="btn ghost" href="/cart.html">Перейти до кошика</a>
        </div>
      </div>
    </div>
  `;
  document.getElementById("buy")?.addEventListener("click", () => {
    addToCart(p, 1);
    toast("Додано в кошик");
  });
} catch (error) {
  page.innerHTML = `<div class="empty">${error.message}</div>`;
}
