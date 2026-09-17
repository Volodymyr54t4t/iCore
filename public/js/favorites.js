import { addToCart, formatPrice, getWishlist, mountNav, showCartConfirmation, toggleFavorite } from "./api.js";

await mountNav();
const host = document.getElementById("favorites");

function render() {
  const products = getWishlist();
  host.innerHTML = products.length ? `
    <div class="favorites-grid">
      ${products.map((product) => `<article class="favorite-item">
        <a href="/product.html?slug=${product.slug}"><img src="${product.imageUrl}" alt="${product.name}" /></a>
        <div><p>${product.category?.name || "Apple"}</p><h2><a href="/product.html?slug=${product.slug}">${product.name}</a></h2><span>${product.tagline || ""}</span><b>${formatPrice(product.price)}</b></div>
        <div class="favorite-actions"><button class="btn" data-add="${product.id}">У кошик +</button><button class="favorite-remove" data-remove="${product.id}" aria-label="Прибрати ${product.name} з обраного">×</button></div>
      </article>`).join("")}
    </div>` : `<section class="favorites-empty"><div>♥</div><h2>Тут буде ваше обране</h2><p>Натискайте сердечко на товарах, які хочете зберегти.</p><a class="btn" href="/#catalog">Переглянути каталог →</a></section>`;
}

host.addEventListener("click", (event) => {
  const id = event.target.closest("[data-add], [data-remove]")?.dataset.add || event.target.closest("[data-remove]")?.dataset.remove;
  if (!id) return;
  const product = getWishlist().find((item) => String(item.id) === String(id));
  if (!product) return;
  if (event.target.closest("[data-add]")) { addToCart(product); showCartConfirmation(product); }
  else { toggleFavorite(product); render(); }
});

render();
