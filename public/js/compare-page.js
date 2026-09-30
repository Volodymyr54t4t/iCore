import { mountNav, formatPrice } from "./api.js";
import { clearCompared, getCompared, removeCompared } from "./compare.js";

await mountNav();

const root = document.getElementById("comparison");
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const valueText = (value) => {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map(valueText).filter((entry) => entry !== "—").join(", ") || "—";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${valueText(item)}`).join(", ");
  return String(value).trim() || "—";
};
const canonical = (key) => {
  const text = key.toLocaleLowerCase("uk-UA").replace(/[’']/g, "");
  if (/пам|storage|memory|ємн.*пам|обєм/.test(text)) return "Пам’ять";
  if (/кам|camera/.test(text)) return "Камера";
  if (/акум|батар|battery|автоном/.test(text)) return "Батарея";
  if (/ваг|weight/.test(text)) return "Вага";
  if (/гарант|warranty/.test(text)) return "Гарантія";
  if (/дисплей|екран|display/.test(text)) return "Дисплей";
  if (/процес|чип|chip|cpu/.test(text)) return "Процесор";
  if (/колір|color/.test(text)) return "Колір";
  if (/sim/.test(text)) return "SIM-карта";
  if (/операц.*систем|os|ios/.test(text)) return "Операційна система";
  if (/оператив.*пам|ram/.test(text)) return "Оперативна пам’ять";
  return null;
};
const fixedRows = ["Пам’ять", "Камера", "Батарея", "Вага", "Гарантія", "Дисплей", "Процесор", "Колір", "SIM-карта", "Операційна система", "Оперативна пам’ять"];

function productValue(product, label) {
  if (label === "Пам’ять" && product.storage) return valueText(product.storage);
  if (label === "Колір" && product.color) return valueText(product.color);
  const specs = product.specifications && typeof product.specifications === "object" ? product.specifications : {};
  const match = Object.entries(specs).find(([key]) => canonical(key) === label);
  return match ? valueText(match[1]) : "—";
}

function render() {
  const products = getCompared();
  if (products.length < 2) {
    root.innerHTML = `<section class="compare-empty"><span aria-hidden="true">⇄</span><p class="eyebrow dark"><span></span> ВАШ ВИБІР</p><h2>${products.length ? "Додайте ще один товар" : "Поки немає товарів для порівняння"}</h2><p>${products.length ? "Для порівняння потрібно щонайменше два товари. Оберіть ще один у каталозі — він з’явиться тут." : "Додавайте товари до порівняння з каталогу або зі сторінки товару. Можна обрати до чотирьох позицій."}</p>${products.length ? `<div class="compare-selected-preview"><img src="${escapeHtml(products[0].imageUrl || "")}" alt="" /><div><b>${escapeHtml(products[0].name)}</b><small>${formatPrice(products[0].price)}</small></div><button type="button" data-remove-product="${escapeHtml(products[0].id)}" aria-label="Прибрати товар">×</button></div>` : ""}<a class="btn" href="/">Перейти до каталогу <span>→</span></a></section>`;
    return;
  }

  const customRows = [...new Set(products.flatMap((product) => Object.keys(product.specifications || {}).filter((key) => !canonical(key))))].sort((a, b) => a.localeCompare(b, "uk"));
  const rows = [
    { label: "Ціна", values: products.map((p) => formatPrice(p.price)), compare: true, kind: "price" },
    { label: "Наявність", values: products.map((p) => p.isAvailable ? "В наявності" : "Під замовлення"), compare: true },
    ...fixedRows.map((label) => ({ label, values: products.map((p) => productValue(p, label)), compare: true })),
    ...customRows.map((label) => ({ label, values: products.map((p) => valueText(p.specifications?.[label])), compare: true })),
  ];
  const tableRows = rows.map(({ label, values, kind }) => {
    const distinct = new Set(values.filter((value) => value !== "—").map((value) => value.toLocaleLowerCase("uk-UA")));
    const different = distinct.size > 1;
    return `<tr class="${different ? "is-different" : ""}"><th scope="row">${escapeHtml(label)}${different ? `<span class="difference-mark" title="Є відмінності" aria-label="Є відмінності">✦</span>` : ""}</th>${values.map((value) => `<td class="${different ? "is-different-cell" : ""} ${value === "—" ? "is-missing" : ""} ${kind === "price" ? "compare-price" : ""}">${escapeHtml(value)}</td>`).join("")}</tr>`;
  }).join("");

  root.innerHTML = `<div class="compare-toolbar"><p><span class="difference-legend">✦</span> Золотим підсвічені характеристики, які відрізняються</p><button type="button" class="compare-clear-all" data-clear-comparison>Очистити порівняння</button></div><div class="compare-table-scroll" tabindex="0" aria-label="Порівняльна таблиця товарів"><table class="compare-table"><thead><tr><th class="compare-label-head" scope="col">Характеристика</th>${products.map((product) => `<th scope="col"><article class="compare-product"><a href="/product.html?slug=${encodeURIComponent(product.slug || "")}" class="compare-product-image"><img src="${escapeHtml(product.imageUrl || "")}" alt="${escapeHtml(product.name)}" loading="lazy" /></a><a class="compare-product-name" href="/product.html?slug=${encodeURIComponent(product.slug || "")}">${escapeHtml(product.name)}</a><small>${escapeHtml(product.category?.name || "LONDÉ")}</small><b>${formatPrice(product.price)}</b><div class="compare-product-actions"><a class="btn ghost" href="/product.html?slug=${encodeURIComponent(product.slug || "")}">Детальніше</a><button type="button" data-remove-product="${escapeHtml(product.id)}" aria-label="Прибрати ${escapeHtml(product.name)} з порівняння">×</button></div></article></th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div><p class="compare-footnote">Показано характеристики, доступні в картці товару. Позначка «—» означає, що параметр не вказаний.</p>${products.length < 4 ? `<a class="compare-add-more" href="/">＋ Додати ще товар <span>(${products.length}/4)</span></a>` : ""}`;
}

root.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-product]");
  if (remove) { removeCompared(remove.dataset.removeProduct); render(); return; }
  if (event.target.closest("[data-clear-comparison]")) { clearCompared(); render(); }
});
window.addEventListener("londe:compare-change", render);
render();
