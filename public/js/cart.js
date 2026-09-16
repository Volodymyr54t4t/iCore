import { formatPrice, getCart, saveCart, nav, updateCartBadge } from "./api.js";

document.getElementById("nav").innerHTML = nav();
updateCartBadge();

function render() {
  const cart = getCart();
  const root = document.getElementById("cart");
  if (!cart.length) {
    root.innerHTML = `<div class="empty">Кошик порожній. <a href="/">До каталогу</a></div>`;
    return;
  }
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  root.innerHTML = `
    <table class="cart-table">
      <thead><tr><th>Товар</th><th>Ціна</th><th>К-сть</th><th>Сума</th><th></th></tr></thead>
      <tbody>
        ${cart
          .map(
            (i) => `
          <tr>
            <td><a href="/product.html?slug=${i.slug}">${i.name}</a></td>
            <td>${formatPrice(i.price)}</td>
            <td><input class="qty" type="number" min="1" value="${i.quantity}" data-qty="${i.id}" /></td>
            <td>${formatPrice(i.price * i.quantity)}</td>
            <td><button class="btn ghost" data-remove="${i.id}">Прибрати</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="price" style="margin-top:20px">Разом: ${formatPrice(total)}</p>
    <a class="btn" href="/checkout.html">Оформити замовлення</a>
  `;
}

document.getElementById("cart").addEventListener("input", (e) => {
  const input = e.target.closest("[data-qty]");
  if (!input) return;
  const cart = getCart();
  const item = cart.find((i) => String(i.id) === input.dataset.qty);
  item.quantity = Math.max(1, Number(input.value) || 1);
  saveCart(cart);
  render();
});

document.getElementById("cart").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  saveCart(getCart().filter((i) => String(i.id) !== btn.dataset.remove));
  render();
});

render();
