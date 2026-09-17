import { api, formatPrice, addToCart, mountNav, showCartConfirmation, isFavorite, toggleFavorite, toast } from "./api.js";

await mountNav();

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal-on-scroll").forEach((el) => revealObserver.observe(el));

const productsEl = document.getElementById("products");
const chipsEl = document.getElementById("category-chips");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
let category = "";

function card(p) {
  const discount = p.oldPrice && p.oldPrice > p.price
    ? Math.round((1 - p.price / p.oldPrice) * 100)
    : 0;
  return `
    <article class="card product-card">
      <div class="product-card-media">
        <a href="/product.html?slug=${p.slug}" aria-label="Переглянути ${p.name}"><img src="${p.imageUrl}" alt="${p.name}" /></a>
        <div class="product-card-badges">
          <span class="product-category">${p.category.name}</span>
          ${discount ? `<span class="product-discount">−${discount}%</span>` : ""}
        </div>
        <button class="product-card-favorite ${isFavorite(p.id) ? "is-active" : ""}" type="button" data-favorite="${p.id}" aria-label="${isFavorite(p.id) ? "Прибрати з обраного" : "Додати в обране"}" aria-pressed="${isFavorite(p.id)}">♥</button>
        <button class="product-card-open" type="button" data-quick-view="${p.id}" aria-label="Швидкий перегляд ${p.name}"><span>↗</span></button>
      </div>
      <div class="card-body">
        <div class="product-card-meta"><span>${p.stock > 0 ? "В наявності" : "Під замовлення"}</span><i></i><span>Офіційна гарантія</span></div>
        <h3><a href="/product.html?slug=${p.slug}">${p.name}</a></h3>
        <div class="tagline">${p.tagline}</div>
        <div class="price"><span>${formatPrice(p.price)}</span>${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ""}</div>
        <div class="row">
          <button class="btn" data-add="${p.id}">У кошик <span>+</span></button>
          <a class="btn ghost" href="/product.html?slug=${p.slug}">Детальніше <span>→</span></a>
        </div>
      </div>
    </article>
  `;
}

async function load() {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (searchEl.value.trim()) params.set("q", searchEl.value.trim());
  if (sortEl.value) params.set("sort", sortEl.value);
  try {
    const products = await api("/api/products?" + params.toString());
    window.__products = products;
    productsEl.innerHTML = products.length
      ? products.map(card).join("")
      : `<div class="empty">Нічого не знайдено</div>`;
    productsEl.querySelectorAll(".card").forEach((el, index) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(14px)";
      requestAnimationFrame(() => {
        el.style.transition = `opacity .4s ease ${Math.min(index * 45, 260)}ms, transform .4s ease ${Math.min(index * 45, 260)}ms`;
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    });
  } catch (error) {
    productsEl.innerHTML = `<div class="empty">${error.message}</div>`;
  }
}

try {
  const categories = await api("/api/categories");
  chipsEl.innerHTML = categories
    .map((c) => `<button class="chip" data-category="${c.slug}" id="${c.slug}">${c.name}</button>`)
    .join("");
} catch (error) {
  chipsEl.innerHTML = `<div class="empty">${error.message}</div>`;
}

function selectCategory(chip) {
  category = chip.dataset.category;
  document.querySelectorAll(".filters .chip").forEach((el) => el.classList.toggle("active", el.dataset.category === category));
  load();
}

document.querySelector(".filters").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-category]");
  if (!chip) return;
  selectCategory(chip);
});

document.querySelectorAll(".category-card[data-category]").forEach((card) => {
  card.addEventListener("click", () => {
    selectCategory(card);
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

searchEl.addEventListener("input", () => load());
sortEl.addEventListener("change", () => load());

productsEl.addEventListener("click", (e) => {
  const favorite = e.target.closest("[data-favorite]");
  if (favorite) {
    const product = window.__products.find((p) => String(p.id) === favorite.dataset.favorite);
    if (!product) return;
    const added = toggleFavorite(product);
    favorite.classList.toggle("is-active", added);
    favorite.setAttribute("aria-pressed", String(added));
    favorite.setAttribute("aria-label", added ? "Прибрати з обраного" : "Додати в обране");
    toast(added ? "Додано в обране" : "Прибрано з обраного");
    return;
  }
  const quickView = e.target.closest("[data-quick-view]");
  if (quickView) {
    const product = window.__products.find((p) => String(p.id) === quickView.dataset.quickView);
    if (product) showQuickView(product);
    return;
  }
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const product = window.__products.find((p) => String(p.id) === btn.dataset.add);
  if (!product) return;
  addToCart(product, 1);
  showCartConfirmation(product);
});

function showQuickView(product) {
  document.querySelector(".quick-view")?.remove();
  const modal = document.createElement("div");
  modal.className = "quick-view";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", `Швидкий перегляд: ${product.name}`);
  modal.innerHTML = `
    <div class="quick-view-backdrop" data-close-quick-view></div>
    <section class="quick-view-panel">
      <button class="quick-view-close" type="button" data-close-quick-view aria-label="Закрити">×</button>
      <img src="${product.imageUrl}" alt="${product.name}" />
      <div class="quick-view-copy">
        <p>${product.category.name}</p><h2>${product.name}</h2><span>${product.tagline}</span>
        <div class="quick-view-price">${formatPrice(product.price)}${product.oldPrice ? `<del>${formatPrice(product.oldPrice)}</del>` : ""}</div>
        <small>${product.stock > 0 ? `● В наявності: ${product.stock} шт.` : "Під замовлення"}</small>
        <div><button class="btn" type="button" data-quick-add>У кошик <span>+</span></button><a class="btn ghost" href="/product.html?slug=${product.slug}">Усі деталі →</a></div>
      </div>
    </section>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelectorAll("[data-close-quick-view]").forEach((button) => button.addEventListener("click", close));
  modal.querySelector("[data-quick-add]")?.addEventListener("click", () => { addToCart(product); showCartConfirmation(product); close(); });
  modal.querySelector(".quick-view-close").focus();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelector(".quick-view")?.remove();
});

await load();

if (location.hash) {
  document.querySelector(location.hash)?.scrollIntoView();
}
