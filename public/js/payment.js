import { api, formatPrice, mountNav, toast } from "./api.js";

await mountNav();
const root = document.getElementById("payment");
const params = new URLSearchParams(location.search);
const id = params.get("order");
const token = params.get("token");
const banks = { monobank: "Monobank", privatbank: "ПриватБанк" };

function error(message) { root.innerHTML = `<div class="empty"><h2>Не вдалося відкрити рахунок</h2><p>${message}</p><a class="btn" href="/">На головну</a></div>`; }
function receipt(order) {
  return `<aside class="payment-receipt"><div class="receipt-brand"> iCore <span>STORE</span></div><p>Рахунок на передоплату</p><h2>${order.receipt}</h2><div><span>Замовлення</span><b>№${order.id}</b></div><div><span>Повна сума</span><b>${formatPrice(order.total)}</b></div><div class="receipt-total"><span>Передоплата 50%</span><b>${formatPrice(order.paymentAmount)}</b></div><small>Залишок ${formatPrice(order.total - order.paymentAmount)} сплачується після підтвердження замовлення.</small></aside>`;
}
async function show() {
  if (!id || !token) return error("Перевірте посилання з рахунком.");
  try {
    const order = await api(`/api/orders/${encodeURIComponent(id)}/payment?token=${encodeURIComponent(token)}`);
    const complete = order.paymentStatus === "proof_submitted" || order.paymentStatus === "confirmed";
    root.innerHTML = `<div class="payment-layout"><section class="payment-card"><p class="payment-step">Крок 2 із 2 · контроль оплати</p><h1>${complete ? "Скрін передоплати надіслано" : "Завершіть передоплату"}</h1><p class="muted">${complete ? "Дякуємо. Адміністратор перевірить платіж і підтвердить замовлення." : "Сплатіть 50% суми замовлення, а потім прикріпіть скрін підтвердження."}</p>${complete ? `<div class="payment-success">✓ Доказ оплати отримано${order.proofAt ? ` · ${new Date(order.proofAt).toLocaleString("uk-UA")}` : ""}</div><a class="btn" href="/">На головну</a>` : `<section class="bank-choice"><h3>1. Оберіть банк</h3><div class="bank-options"><button class="bank ${order.provider === "monobank" ? "selected" : ""}" data-bank="monobank"><b>mono</b><span>Monobank</span></button><button class="bank ${order.provider === "privatbank" ? "selected" : ""}" data-bank="privatbank"><b>24</b><span>Приват24</span></button></div></section><section class="transfer-details" id="transfer" ${order.provider ? "" : "hidden"}><h3>2. Зробіть переказ</h3><p>Переказати на картку Monobank</p><button class="card-number" id="copy-card">4874 0700 2410 9280 <span>Скопіювати</span></button><strong>${formatPrice(order.paymentAmount)}</strong><small>Призначення: передоплата за ${order.receipt}</small><p class="bank-note">Ви обрали: <b id="selected-bank">${banks[order.provider] || ""}</b>. Відкрийте свій банківський застосунок і виконайте переказ.</p></section><section class="proof-upload" id="proof" ${order.provider ? "" : "hidden"}><h3>3. Прикріпіть скрін оплати</h3><label class="proof-drop"><input type="file" id="proof-file" accept="image/png,image/jpeg,image/webp" /><b>Обрати скрін</b><small>PNG, JPG або WebP · до 5 МБ</small></label><p id="file-name" class="muted"></p><button class="btn" id="send-proof" disabled>Надіслати на перевірку</button><p class="error" id="pay-error"></p></section>`}</section>${receipt(order)}</div>`;
    root.querySelectorAll("[data-bank]").forEach((button) => button.onclick = async () => { try { await api(`/api/orders/${id}/payment-method`, { method: "PATCH", body: { token, provider: button.dataset.bank } }); toast(`Обрано ${banks[button.dataset.bank]}`); await show(); } catch (e) { document.getElementById("pay-error")?.replaceChildren(e.message); } });
    document.getElementById("copy-card")?.addEventListener("click", async () => { await navigator.clipboard.writeText("4874070024109280"); toast("Номер картки скопійовано"); });
    const file = document.getElementById("proof-file");
    file?.addEventListener("change", () => { const f = file.files[0]; document.getElementById("file-name").textContent = f ? `Обрано: ${f.name}` : ""; document.getElementById("send-proof").disabled = !f; });
    document.getElementById("send-proof")?.addEventListener("click", async () => { const f = file.files[0]; const button = document.getElementById("send-proof"); const out = document.getElementById("pay-error"); if (!f) return; if (f.size > 5 * 1024 * 1024) { out.textContent = "Розмір скріну має бути до 5 МБ"; return; } const reader = new FileReader(); reader.onload = async () => { try { button.disabled = true; button.textContent = "Надсилаємо…"; await api(`/api/orders/${id}/payment-proof`, { method: "POST", body: { token, dataUrl: reader.result } }); toast("Скрін надіслано"); show(); } catch (e) { out.textContent = e.message; button.disabled = false; button.textContent = "Надіслати на перевірку"; } }; reader.readAsDataURL(f); });
  } catch (e) { error(e.message); }
}
show();
