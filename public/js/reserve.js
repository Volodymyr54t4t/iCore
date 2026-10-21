import { api, formatPrice, mountNav } from "./api.js";

await mountNav();
const content = document.getElementById("reservation-content");
const productSlug = new URLSearchParams(location.search).get("product");
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

try {
  if (!productSlug) throw new Error("Оберіть товар у каталозі, щоб створити бронювання.");
  const product = await api(`/api/products/${encodeURIComponent(productSlug)}`);
  if (!product.isAvailable) throw new Error("Цей товар зараз недоступний для бронювання.");
  content.innerHTML = `<article class="reservation-product"><img src="${escapeHtml(product.imageUrl || "/images/londe-logo.png")}" alt="${escapeHtml(product.name)}" /><div><span>${escapeHtml(product.category?.name || "Apple")}</span><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.color || "")} ${escapeHtml(product.storage || "")}</p><b>${formatPrice(product.price)}</b></div></article><form class="reservation-form" id="reservation-form"><div class="reservation-form-head"><h2>Контактні дані</h2><p>Бронювання дійсне 7 днів. Ми зв’яжемося для підтвердження.</p></div><div class="reservation-fields"><label>Ім’я та прізвище<input name="name" autocomplete="name" minlength="2" maxlength="100" required placeholder="Як до вас звертатися" /></label><label>Телефон<input name="phone" type="tel" autocomplete="tel" minlength="7" maxlength="40" required placeholder="+380…" /></label><label>Email<input name="email" type="email" autocomplete="email" maxlength="150" required placeholder="name@example.com" /></label><label>Місто<input name="city" autocomplete="address-level2" maxlength="100" placeholder="Наприклад, Київ" /></label><label>Кількість<select name="quantity">${Array.from({ length: Math.min(10, Math.max(1, Number(product.stock) || 10)) }, (_, index) => `<option value="${index + 1}">${index + 1} шт.</option>`).join("")}</select></label><label class="reservation-notes">Коментар<textarea name="notes" maxlength="1000" placeholder="Зручний час для дзвінка або запитання"></textarea></label></div><div class="reservation-total"><span>Разом за товар</span><b id="reservation-total">${formatPrice(product.price)}</b></div><p class="reservation-error" id="reservation-error" role="alert"></p><button class="btn reservation-submit" type="submit">Підтвердити бронювання <span>→</span></button><small class="reservation-terms">Натискаючи кнопку, ви погоджуєтеся, що менеджер зв’яжеться з вами щодо бронювання. Оплата зараз не потрібна.</small></form>`;
  const form = document.getElementById("reservation-form");
  const quantity = form.elements.quantity;
  quantity.addEventListener("change", () => { document.getElementById("reservation-total").textContent = formatPrice(product.price * Number(quantity.value)); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    const errorEl = document.getElementById("reservation-error");
    submit.disabled = true;
    submit.textContent = "Створюємо бронювання…";
    errorEl.textContent = "";
    try {
      const data = Object.fromEntries(new FormData(form));
      const reservation = await api("/api/reservations", { method: "POST", body: { ...data, productSlug, quantity: Number(data.quantity) } });
      try {
        const refs = JSON.parse(localStorage.getItem("icore-reservations") || "[]").filter((item) => Number(item.id) !== Number(reservation.id));
        refs.unshift({ id: reservation.id, token: reservation.accessToken, createdAt: reservation.expiresAt });
        localStorage.setItem("icore-reservations", JSON.stringify(refs.slice(0, 30)));
      } catch { /* The private confirmation link remains available even if local storage is disabled. */ }
      location.assign(reservation.manageUrl);
    } catch (error) {
      errorEl.textContent = error.message;
      submit.disabled = false;
      submit.innerHTML = "Підтвердити бронювання <span>→</span>";
    }
  });
} catch (error) {
  content.innerHTML = `<div class="reservation-message"><h2>Не вдалося підготувати бронювання</h2><p>${escapeHtml(error.message)}</p><a class="btn" href="/#catalog">До каталогу</a></div>`;
}
