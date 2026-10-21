import { api, formatPrice, mountNav } from "./api.js";

const root = document.getElementById("my-reservations");
const me = await mountNav();
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const date = (value) => new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const states = { new: "Очікує підтвердження", confirmed: "Підтверджено", cancelled: "Скасовано", expired: "Термін завершився", completed: "Завершено" };

try {
  let reservations = [];
  if (me) reservations = await api("/api/account/reservations");
  let refs = [];
  try { refs = JSON.parse(localStorage.getItem("icore-reservations") || "[]"); } catch { refs = []; }
  const known = new Set(reservations.map((item) => Number(item.id)));
  const guest = await Promise.all(refs.filter((ref) => !known.has(Number(ref.id)) && ref.token).map(async (ref) => {
    try { return { ...(await api(`/api/reservations/${encodeURIComponent(ref.id)}?token=${encodeURIComponent(ref.token)}`)), manageToken: ref.token }; }
    catch { return null; }
  }));
  reservations = [...reservations.map((item) => ({ ...item, accountManaged: true })), ...guest.filter(Boolean)];
  reservations.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  root.innerHTML = reservations.length ? reservations.map((item) => {
    const account = item.accountManaged;
    const manage = account ? `/reservation.html?id=${item.id}&account=1` : `/reservation.html?id=${item.id}&token=${encodeURIComponent(item.manageToken)}`;
    return `<article class="my-reservation-card"><img src="${escapeHtml(item.product_image || "/images/londe-logo.png")}" alt="" /><div class="my-reservation-copy"><p>Бронювання №${item.id} · ${date(item.created_at)}</p><h2>${escapeHtml(item.product_name)}</h2><span>${item.quantity} шт. · ${formatPrice(Number(item.unit_price)*Number(item.quantity))}</span><span class="my-reservation-status ${escapeHtml(item.status)}">${escapeHtml(states[item.status] || item.status)}</span><small>Дійсне до ${date(item.expires_at)}</small></div><div class="my-reservation-actions"><a class="btn ghost" href="${manage}">${item.signed_at ? "Переглянути квитанцію" : ["new","confirmed"].includes(item.status) ? "Керувати / підписати" : "Деталі"}</a>${item.signed_receipt_svg_url ? `<a class="reservation-back" href="${escapeHtml(item.signed_receipt_svg_url)}" download="londe-bronirovanie-${item.id}.svg">Завантажити SVG</a>` : ""}</div></article>`;
  }).join("") : `<div class="reservation-message"><h2>Поки немає бронювань</h2><p>${me ? "Увійди в акаунт під час бронювання — записи з’являться тут." : "Бронювання, створені на цьому пристрої, з’являться тут. Збережи приватне посилання з квитанції, щоб відкрити його на іншому пристрої."}</p><a class="btn" href="/#catalog">Обрати товар</a>${!me ? `<a class="my-reservations-login" href="/login.html?next=/my-reservations.html">Увійти в акаунт</a>` : ""}</div>`;
} catch (error) {
  root.innerHTML = `<div class="reservation-message"><h2>Не вдалося завантажити бронювання</h2><p>${escapeHtml(error.message)}</p><a class="btn" href="/">На головну</a></div>`;
}
