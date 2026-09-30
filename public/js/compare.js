const STORAGE_KEY = "londe-compare-products";
export const COMPARE_LIMIT = 4;

function readItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id != null).slice(0, COMPARE_LIMIT) : [];
  } catch { return []; }
}

function writeItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, COMPARE_LIMIT)));
  window.dispatchEvent(new CustomEvent("londe:compare-change", { detail: { items: readItems() } }));
}

export function getCompared() { return readItems(); }
export function isCompared(id) { return readItems().some((item) => String(item.id) === String(id)); }

export function addCompared(product) {
  const items = readItems();
  if (items.some((item) => String(item.id) === String(product.id))) return { added: false, items };
  if (items.length >= COMPARE_LIMIT) return { limit: true, items };
  items.push({
    id: product.id, slug: product.slug, name: product.name, price: product.price,
    oldPrice: product.oldPrice, imageUrl: product.imageUrl, tagline: product.tagline,
    category: product.category, color: product.color, storage: product.storage,
    specifications: product.specifications || {}, isAvailable: product.isAvailable,
  });
  writeItems(items);
  return { added: true, items };
}

export function removeCompared(id) {
  const items = readItems().filter((item) => String(item.id) !== String(id));
  writeItems(items);
  return items;
}

export function clearCompared() { writeItems([]); }

const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

export function initCompareBar() {
  if (document.body.dataset.compareBarReady) return;
  document.body.dataset.compareBarReady = "true";
  const dock = document.createElement("aside");
  dock.className = "compare-dock";
  dock.setAttribute("aria-label", "Товари для порівняння");
  document.body.append(dock);

  const render = () => {
    const items = readItems();
    dock.hidden = items.length === 0;
    dock.innerHTML = `<div class="compare-dock-inner"><div class="compare-dock-copy"><span class="compare-dock-icon" aria-hidden="true">⇄</span><div><b>Порівняння товарів</b><small>${items.length} з ${COMPARE_LIMIT} обрано${items.length === 1 ? " · додайте ще хоча б один" : ""}</small></div></div><div class="compare-dock-items">${items.map((item) => `<span title="${esc(item.name)}">${esc(item.name)}</span>`).join("")}</div><div class="compare-dock-actions"><button class="btn ghost" type="button" data-compare-clear>Очистити</button><button class="btn" type="button" data-compare-open ${items.length < 2 ? "disabled" : ""}>Порівняти <span>→</span></button></div></div>`;
    document.querySelectorAll("[data-compare]").forEach((button) => {
      const active = items.some((item) => String(item.id) === String(button.dataset.compare));
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? "Прибрати з порівняння" : "Додати до порівняння");
      if (button.classList.contains("detail-compare")) button.innerHTML = active ? "✓ У порівнянні" : "⇄ Порівняти";
      else button.textContent = active ? "✓ Порівняно" : "⇄ Порівняти";
    });
  };
  window.addEventListener("londe:compare-change", render);
  dock.addEventListener("click", (event) => {
    if (event.target.closest("[data-compare-clear]")) clearCompared();
    if (event.target.closest("[data-compare-open]") && readItems().length >= 2) location.href = "/compare.html";
  });
  render();
}
