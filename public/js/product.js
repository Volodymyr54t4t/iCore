import { api, formatPrice, addToCart, mountNav, showCartConfirmation, getRecentProducts, isFavorite, rememberProduct, toggleFavorite, toast } from "./api.js";

await mountNav();

const slug = new URLSearchParams(location.search).get("slug");
const page = document.getElementById("page");
const esc = (value = "") => String(value).replace(/[&<>\"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));
const stars = (value) => "★".repeat(Number(value)) + "☆".repeat(5 - Number(value));

try {
  const p = await api("/api/products/" + encodeURIComponent(slug));
  const reviewData = await api("/api/products/" + encodeURIComponent(slug) + "/reviews");
  const recent = getRecentProducts().filter((item) => String(item.id) !== String(p.id)).slice(0, 4);
  const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  document.title = p.name + " — CVV ELECTRONICS";
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
          <div>${p.isAvailable ? "Є в наявності" : "Немає в наявності"}</div>
        </div>
        <div class="row" style="margin-top:24px">
          <button class="btn" id="buy" ${p.isAvailable ? "" : "disabled"}>Додати в кошик</button>
          <a class="btn ghost" href="/cart.html">Перейти до кошика</a>
          <button class="share-product" id="share" type="button">↗ Поділитися</button>
        </div>
      </div>
    </div><section class="product-reviews" id="reviews"><div class="reviews-heading"><div><p class="eyebrow dark"><span></span> Досвід покупців</p><h2>Відгуки <em>про товар</em></h2></div><div class="review-score"><b>${reviewData.average}</b><span class="review-stars">${stars(Math.round(Number(reviewData.average)))}</span><small>${reviewData.count} відгуків</small></div></div><div class="reviews-layout"><div class="review-list">${reviewData.reviews.length ? reviewData.reviews.map((r) => `<article class="review-card"><div class="review-card-top"><b>${esc(r.author_name)}</b><span>${stars(r.rating)}</span></div>${r.title ? `<h3>${esc(r.title)}</h3>` : ""}<p>${esc(r.body).replace(/\n/g, "<br>")}</p><small>${new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(new Date(r.created_at))}${r.is_verified ? " · ✓ Підтверджена покупка" : ""}</small></article>`).join("") : `<p class="reviews-empty">Поки немає відгуків. Поділіться першим враженням про товар.</p>`}</div><form class="review-form" id="review-form"><h3>Залишити відгук</h3><label>Ваша оцінка<select name="rating" required><option value="">Оберіть оцінку</option><option value="5">★★★★★ — Чудово</option><option value="4">★★★★☆ — Добре</option><option value="3">★★★☆☆ — Нормально</option><option value="2">★★☆☆☆ — Погано</option><option value="1">★☆☆☆☆ — Дуже погано</option></select></label><label>Ім’я<input name="authorName" minlength="2" maxlength="80" required placeholder="Як до вас звертатися" /></label><label>Заголовок<input name="title" maxlength="100" placeholder="Коротко про враження" /></label><label>Ваш відгук<textarea name="body" minlength="10" maxlength="2000" required placeholder="Що сподобалось або що можна покращити?"></textarea></label><button class="btn" type="submit">Надіслати на перевірку</button><p class="review-form-message" id="review-message" aria-live="polite"></p></form></div></section>${recent.length ? `<section class="recent-products"><div><p class="eyebrow dark"><span></span> Нещодавно переглянуті</p><h2>Можливо, ви <em>шукали це.</em></h2></div><div class="recent-grid">${recent.map((item) => `<a href="/product.html?slug=${item.slug}"><img src="${item.imageUrl}" alt="${item.name}" /><span>${item.category?.name || "Apple"}</span><b>${item.name}</b><small>${formatPrice(item.price)}</small></a>`).join("")}</div></section>` : ""}
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
    const shareData = { title: p.name, text: `${p.name} — CVV ELECTRONICS`, url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(location.href); toast("Посилання скопійовано"); }
    } catch (error) { if (error.name !== "AbortError") toast("Не вдалося поділитися посиланням"); }
  });
  document.getElementById("review-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("review-message");
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const data = new FormData(form);
      const result = await api(`/api/products/${encodeURIComponent(slug)}/reviews`, { method: "POST", body: Object.fromEntries(data) });
      message.textContent = result.message;
      form.reset();
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  });
} catch (error) {
  page.innerHTML = `<div class="empty">${error.message}</div>`;
}
