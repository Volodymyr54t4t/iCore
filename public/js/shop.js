import { api, formatPrice, addToCart, nav, updateCartBadge, toast } from "./api.js";

document.getElementById("nav").innerHTML = nav();
updateCartBadge();

const productsEl = document.getElementById("products");
const chipsEl = document.getElementById("category-chips");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
let category = "";

function card(p) {
  return `
    <article class="card">
      <a href="/product.html?slug=${p.slug}"><img src="${p.imageUrl}" alt="${p.name}" /></a>
      <div class="card-body">
        <h3><a href="/product.html?slug=${p.slug}">${p.name}</a></h3>
        <div class="tagline">${p.tagline}</div>
        <div class="price">${formatPrice(p.price)}${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ""}</div>
        <div class="row">
          <button class="btn" data-add="${p.id}">У кошик</button>
          <a class="btn ghost" href="/product.html?slug=${p.slug}">Деталі</a>
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
  const products = await api("/api/products?" + params.toString());
  window.__products = products;
  productsEl.innerHTML = products.length
    ? products.map(card).join("")
    : `<div class="empty">Нічого не знайдено</div>`;
}

const categories = await api("/api/categories");
chipsEl.innerHTML = categories
  .map((c) => `<button class="chip" data-category="${c.slug}" id="${c.slug}">${c.name}</button>`)
  .join("");

document.querySelector(".filters").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-category]");
  if (!chip) return;
  category = chip.dataset.category;
  document.querySelectorAll(".chip").forEach((el) => el.classList.toggle("active", el === chip));
  load();
});

searchEl.addEventListener("input", () => load());
sortEl.addEventListener("change", () => load());

productsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const product = window.__products.find((p) => String(p.id) === btn.dataset.add);
  if (!product) return;
  addToCart(product, 1);
  toast("Додано в кошик");
});

await load();

if (location.hash) {
  document.querySelector(location.hash)?.scrollIntoView();
}
