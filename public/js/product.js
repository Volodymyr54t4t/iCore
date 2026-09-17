import { api, formatPrice, addToCart, mountNav, showCartConfirmation, getRecentProducts, isFavorite, rememberProduct, toggleFavorite, toast } from "./api.js";

await mountNav();

const slug = new URLSearchParams(location.search).get("slug");
const page = document.getElementById("page");

try {
  const p = await api("/api/products/" + encodeURIComponent(slug));
  const recent = getRecentProducts().filter((item) => String(item.id) !== String(p.id)).slice(0, 4);
  const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  document.title = p.name + " — iCore Store";
  page.innerHTML = `
    <div class="product-layout">
      <div class="product-photo"><img src="${p.imageUrl}" alt="${p.name}" />${discount ? `<span class="product-page-discount">−${discount}%</span>` : ""}</div>
      <div class="product-details">
        <div class="product-detail-top"><p class="muted">${p.category.name}</p><button class="detail-favorite ${isFavorite(p.id) ? "is-active" : ""}" type="button" id="favorite" aria-label="Додати в обране">♥</button></div>
        <h1 class="section-title">${p.name}</h1>
        <p>${p.tagline}</p>
        <p>${p.description}</p>
        <div class="price" style="font-size:28px;margin:18px 0">${formatPrice(p.price)}${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ""}</div>
        <div class="product-perks"><span>✓ Офіційна гарантія</span><span>✓ Відправимо сьогодні</span><span>✓ Оплата частинами</span></div>
        <div class="specs">
          <div>Колір: ${p.color || "—"}</div>
          <div>Конфігурація: ${p.storage || "—"}</div>
          <div>На складі: ${p.stock} шт.</div>
        </div>
        <div class="row" style="margin-top:24px">
          <button class="btn" id="buy" ${p.stock < 1 ? "disabled" : ""}>Додати в кошик</button>
          <a class="btn ghost" href="/cart.html">Перейти до кошика</a>
          <button class="share-product" id="share" type="button">↗ Поділитися</button>
        </div>
      </div>
    </div>${recent.length ? `<section class="recent-products"><div><p class="eyebrow dark"><span></span> Нещодавно переглянуті</p><h2>Можливо, ви <em>шукали це.</em></h2></div><div class="recent-grid">${recent.map((item) => `<a href="/product.html?slug=${item.slug}"><img src="${item.imageUrl}" alt="${item.name}" /><span>${item.category?.name || "Apple"}</span><b>${item.name}</b><small>${formatPrice(item.price)}</small></a>`).join("")}</div></section>` : ""}
  `;
  rememberProduct(p);
  document.getElementById("buy")?.addEventListener("click", () => {
    addToCart(p, 1);
    showCartConfirmation(p);
  });
  document.getElementById("favorite")?.addEventListener("click", (event) => {
    const added = toggleFavorite(p);
    event.currentTarget.classList.toggle("is-active", added);
    event.currentTarget.setAttribute("aria-label", added ? "Прибрати з обраного" : "Додати в обране");
    toast(added ? "Додано в обране" : "Прибрано з обраного");
  });
  document.getElementById("share")?.addEventListener("click", async () => {
    const shareData = { title: p.name, text: `${p.name} — iCore Store`, url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(location.href); toast("Посилання скопійовано"); }
    } catch (error) { if (error.name !== "AbortError") toast("Не вдалося поділитися посиланням"); }
  });
} catch (error) {
  page.innerHTML = `<div class="empty">${error.message}</div>`;
}
