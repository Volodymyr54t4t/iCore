import { api, formatPrice, addToCart, mountNav, showCartConfirmation, getRecentProducts, isFavorite, rememberProduct, toggleFavorite, toast } from "./api.js";
import { addCompared, isCompared, removeCompared } from "./compare.js";

await mountNav();

const slug = new URLSearchParams(location.search).get("slug");
const page = document.getElementById("page");
const esc = (value = "") => String(value).replace(/[&<>\"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));
const stars = (value) => "★".repeat(Number(value)) + "☆".repeat(5 - Number(value));
function renderDescription(value = "") {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+(?=[А-ЯІЇЄA-Z0-9])/g).filter(Boolean);
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 3) paragraphs.push(sentences.slice(index, index + 3).join(" "));
  return `<section class="product-description-card"><div class="product-section-heading"><p class="eyebrow dark"><span></span> ОГЛЯД ТОВАРУ</p><h2>Більше про <em>пристрій.</em></h2></div><div class="product-description">${paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</div></section>`;
}

function renderSpecifications(p) {
  const valueText = (value) => Array.isArray(value) ? value.join(", ") : String(value ?? "").trim();
  const specs = Object.entries(p.specifications || {}).map(([label, value]) => [label, valueText(value)]).filter(([, value]) => value);
  const aliases = new Set(["Об'єм пам'яті", "Колір пристрою"]);
  const unique = specs.filter(([label]) => !aliases.has(label));
  const priority = ["Діагональ екрану", "Тип дисплея", "Процесор", "Конфігурація Apple M4", "Оперативна памʼять", "Об'єм пам'яті"];
  const featured = priority.map((label) => specs.find(([key]) => key === label)).filter(Boolean);
  const featuredLabels = new Set(featured.map(([label]) => label));
  const secondary = unique.filter(([label]) => !featuredLabels.has(label) && label !== "Комплектація");
  const contents = specs.find(([label]) => label === "Комплектація")?.[1];
  const base = [["Колір", p.color], ["Пам’ять", p.storage]].filter(([, value]) => value);
  const overview = featured.length ? featured : base;
  const allRows = [...base, ...secondary].filter((row, index, rows) => rows.findIndex(([label]) => label === row[0]) === index && !featuredLabels.has(row[0]));
  if (!overview.length && !allRows.length && !contents) return "";
  return `<section class="product-specification-card"><div class="product-section-heading"><p class="eyebrow dark"><span></span> ХАРАКТЕРИСТИКИ</p><h2>Усе важливе <em>коротко.</em></h2></div><dl class="product-featured-specs">${overview.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${allRows.length ? `<details class="product-more-specs"><summary>Усі характеристики <span>${allRows.length}</span></summary><dl class="product-specification-list">${allRows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></details>` : ""}${contents ? `<details class="product-box-contents"><summary>Комплектація <span>＋</span></summary><p>${esc(contents)}</p></details>` : ""}</section>`;
}

try {
  const p = await api("/api/products/" + encodeURIComponent(slug));
  const reviewData = await api("/api/products/" + encodeURIComponent(slug) + "/reviews");
  const recent = getRecentProducts().filter((item) => String(item.id) !== String(p.id)).slice(0, 4);
  const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const reviewLabel = reviewData.count ? `${Number(reviewData.average).toFixed(1)} · ${reviewData.count} відгуків` : "Новий товар · залиште перший відгук";
  document.title = p.name + " — LONDÉ BY CVV";
  page.innerHTML = `
    <div class="product-layout">
      <div class="product-photo"><img src="${esc(p.imageUrl || "")}" alt="${esc(p.name)}" />${discount ? `<span class="product-page-discount">−${discount}%</span>` : ""}<span class="product-image-note">Оригінальна техніка Apple</span></div>
      <div class="product-details">
        <div class="product-detail-top"><p class="muted">${esc(p.category.name)}</p><div class="product-detail-actions"><button class="detail-compare ${isCompared(p.id) ? "is-selected" : ""}" type="button" data-compare="${p.id}" aria-pressed="${isCompared(p.id)}">${isCompared(p.id) ? "✓ У порівнянні" : "⇄ Порівняти"}</button><button class="detail-favorite ${isFavorite(p.id) ? "is-active" : ""}" type="button" id="favorite" aria-label="${isFavorite(p.id) ? "Прибрати з обраного" : "Додати в обране"}" aria-pressed="${isFavorite(p.id)}">♥</button></div></div>
        <h1 class="section-title">${esc(p.name)}</h1>
        <p class="product-lead">${esc(p.tagline || "")}</p>
        <a class="product-review-jump" href="#reviews">${reviewData.count ? `<span>${stars(Math.round(Number(reviewData.average)))}</span>` : `<span class="product-no-reviews">Ще без оцінок</span>`} ${reviewLabel} <b>↓</b></a>
        <div class="product-purchase-card"><div class="product-price-line"><div class="price">${formatPrice(p.price)}</div>${p.oldPrice > p.price ? `<div class="product-old-price"><del>${formatPrice(p.oldPrice)}</del><span>−${discount}%</span></div>` : ""}</div><div class="product-stock ${p.isAvailable ? "is-available" : "is-unavailable"}"><i></i>${p.isAvailable ? "Є в наявності" : "Під замовлення"}</div><div class="product-buy-actions"><button class="btn" id="buy" ${p.isAvailable ? "" : "disabled"}>${p.isAvailable ? "Додати в кошик" : "Зараз недоступний"} <span>→</span></button><a class="btn ghost" id="reserve-product" href="/reserve.html?product=${encodeURIComponent(p.slug)}" ${p.isAvailable ? "" : 'aria-disabled="true"'}>Забронювати</a></div><p class="product-delivery-note">Менеджер підтвердить наявність і деталі доставки телефоном.</p></div>
        <div class="product-perks"><span><b>✓</b><span><strong>Гарантія</strong><small>Офіційна підтримка</small></span></span><span><b>↗</b><span><strong>Доставка</strong><small>По всій Україні</small></span></span><span><b>₴</b><span><strong>Оплата</strong><small>Зручний спосіб</small></span></span></div>
        <div class="product-detail-tools"><button class="share-product" id="share" type="button">↗ Поділитися товаром</button><a href="/cart.html">Перейти до кошика →</a></div>
      </div>
    </div><div class="product-information-layout">${renderDescription(p.description)}${renderSpecifications(p)}</div><section class="product-reviews" id="reviews"><div class="reviews-heading"><div><p class="eyebrow dark"><span></span> Досвід покупців</p><h2>Відгуки <em>про товар</em></h2></div><div class="review-score"><b>${reviewData.average}</b><span class="review-stars">${stars(Math.round(Number(reviewData.average)))}</span><small>${reviewData.count} відгуків</small></div></div><div class="reviews-layout"><div class="review-list">${reviewData.reviews.length ? reviewData.reviews.map((r) => `<article class="review-card"><div class="review-card-top"><b>${esc(r.author_name)}</b><span>${stars(r.rating)}</span></div>${r.title ? `<h3>${esc(r.title)}</h3>` : ""}<p>${esc(r.body).replace(/\n/g, "<br>")}</p><small>${new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(new Date(r.created_at))}${r.is_verified ? " · ✓ Підтверджена покупка" : ""}</small></article>`).join("") : `<p class="reviews-empty">Поки немає відгуків. Поділіться першим враженням про товар.</p>`}</div><form class="review-form" id="review-form"><h3>Залишити відгук</h3><label>Ваша оцінка<select name="rating" required><option value="">Оберіть оцінку</option><option value="5">★★★★★ — Чудово</option><option value="4">★★★★☆ — Добре</option><option value="3">★★★☆☆ — Нормально</option><option value="2">★★☆☆☆ — Погано</option><option value="1">★☆☆☆☆ — Дуже погано</option></select></label><label>Ім’я<input name="authorName" minlength="2" maxlength="80" required placeholder="Як до вас звертатися" /></label><label>Заголовок<input name="title" maxlength="100" placeholder="Коротко про враження" /></label><label>Ваш відгук<textarea name="body" minlength="10" maxlength="2000" required placeholder="Що сподобалось або що можна покращити?"></textarea></label><button class="btn" type="submit">Надіслати на перевірку</button><p class="review-form-message" id="review-message" aria-live="polite"></p></form></div></section>${recent.length ? `<section class="recent-products"><div><p class="eyebrow dark"><span></span> Нещодавно переглянуті</p><h2>Можливо, ви <em>шукали це.</em></h2></div><div class="recent-grid">${recent.map((item) => `<a href="/product.html?slug=${item.slug}"><img src="${item.imageUrl}" alt="${item.name}" /><span>${item.category?.name || "Apple"}</span><b>${item.name}</b><small>${formatPrice(item.price)}</small></a>`).join("")}</div></section>` : ""}
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
  page.querySelector("[data-compare]")?.addEventListener("click", (event) => {
    if (isCompared(p.id)) { removeCompared(p.id); toast("Прибрано з порівняння"); return; }
    const result = addCompared(p);
    toast(result.added ? "Додано до порівняння" : result.limit ? "Можна порівняти до 4 товарів" : "Товар уже в порівнянні");
  });
  document.getElementById("share")?.addEventListener("click", async () => {
    const shareData = { title: p.name, text: `${p.name} — LONDÉ BY CVV`, url: location.href };
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
