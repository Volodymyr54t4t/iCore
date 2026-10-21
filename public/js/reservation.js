import { api, formatPrice, mountNav, toast } from "./api.js";

await mountNav();
const content = document.getElementById("reservation-content");
const params = new URLSearchParams(location.search);
const id = params.get("id");
const token = params.get("token");
const accountManaged = params.get("account") === "1";
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const statusLabel = { new: "Очікує підтвердження менеджером", confirmed: "Підтверджено — товар зарезервовано", cancelled: "Скасовано", expired: "Термін бронювання минув", completed: "Завершено" };
const accountPath = `/api/account/reservations/${encodeURIComponent(id || "")}`;

function render(reservation) {
  const active = ["new", "confirmed"].includes(reservation.status);
  const receiptUrl = reservation.signed_receipt_svg_url;
  content.innerHTML = `<article class="reservation-confirmation"><div class="reservation-success-mark">${active ? "✓" : "·"}</div><p class="eyebrow"><span></span> Бронювання №${reservation.id}</p><h2>${reservation.status === "new" ? "Запит уже в нас." : escapeHtml(statusLabel[reservation.status] || reservation.status)}</h2><p class="reservation-status ${escapeHtml(reservation.status)}">${escapeHtml(statusLabel[reservation.status] || reservation.status)}</p><div class="reservation-summary"><img src="${escapeHtml(reservation.product_image || "/images/londe-logo.png")}" alt="" /><div><b>${escapeHtml(reservation.product_name)}</b><small>${reservation.quantity} шт. · ${formatPrice(reservation.unit_price)} за одиницю</small></div><strong>${formatPrice(reservation.unit_price * reservation.quantity)}</strong></div><dl><div><dt>Ім’я</dt><dd>${escapeHtml(reservation.customer_name)}</dd></div><div><dt>Створено</dt><dd>${new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(reservation.created_at))}</dd></div><div><dt>Дійсне до</dt><dd>${new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(reservation.expires_at))}</dd></div></dl><p class="reservation-next-step">Менеджер зв’яжеться з вами, щоб підтвердити наявність і погодити отримання. Оплачувати зараз не потрібно.</p>${receiptUrl ? `<section class="signed-receipt"><h3>Підписана квитанція</h3><div class="receipt-document"><img src="${escapeHtml(receiptUrl)}" alt="Квитанція про бронювання №${reservation.id} з підписом" /></div><p>Підпис збережено у квитанції. Її можна завантажити як SVG або PNG чи надрукувати / зберегти у PDF.</p><div class="receipt-actions"><a class="btn ghost" href="${escapeHtml(receiptUrl)}" download="londe-bronirovanie-${reservation.id}.svg">Завантажити SVG</a><button class="btn ghost" id="download-png" type="button">Завантажити PNG</button><button class="btn ghost" id="print-receipt" type="button">Друк / PDF</button></div></section>` : active ? `<button class="btn reservation-sign-open" id="open-signature" type="button">Підписати квитанцію <span>✎</span></button>` : `<p class="reservation-next-step">Для цього бронювання квитанцію вже не можна підписати.</p>`}${active ? `<button class="btn ghost reservation-cancel" id="cancel-reservation" type="button">Скасувати бронювання</button>` : ""}<p class="reservation-error" id="reservation-error" role="alert"></p><a class="reservation-back" href="/my-reservations.html">Мої бронювання →</a><dialog class="signature-dialog" id="signature-dialog"><form method="dialog" class="signature-panel"><button class="signature-close" value="cancel" aria-label="Закрити">×</button><p class="eyebrow"><span></span> ПІДПИС КВИТАНЦІЇ</p><h2>Підпишіть бронювання</h2><p class="signature-explainer">Намалюйте підпис пальцем, стилусом або мишкою. Він буде доданий до квитанції №${reservation.id}.</p><canvas class="signature-canvas" id="signature-canvas" width="1000" height="250" aria-label="Поле для малювання підпису"></canvas><div class="signature-controls"><button class="btn ghost" id="clear-signature" type="button">Очистити</button><label><input type="checkbox" id="signature-consent" /> Підтверджую бронювання та правильність даних</label></div><p class="signature-disclaimer">Це намальований підпис на квитанції бронювання. Він не є кваліфікованим електронним підписом і не підтверджує оплату.</p><p class="reservation-error" id="signature-error" role="alert"></p><button class="btn" id="save-signature" type="button" disabled>Підписати та зберегти квитанцію</button></form></dialog></article>`;

  document.getElementById("cancel-reservation")?.addEventListener("click", async (event) => {
    if (!confirm("Скасувати це бронювання? Зарезервований залишок повернеться до каталогу.")) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const path = accountManaged ? `${accountPath}/cancel` : `/api/reservations/${encodeURIComponent(id)}/cancel`;
      await api(path, { method: accountManaged ? "PATCH" : "POST", body: accountManaged ? {} : { token } });
      toast("Бронювання скасовано");
      location.reload();
    } catch (error) {
      document.getElementById("reservation-error").textContent = error.message;
      button.disabled = false;
    }
  });

  document.getElementById("download-png")?.addEventListener("click", async () => {
    try {
      const image = new Image();
      image.src = receiptUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1800; canvas.height = 2360;
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { toast("Не вдалося створити PNG"); return; }
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `londe-bronirovanie-${reservation.id}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }, "image/png");
    } catch (error) { toast(error.message || "Не вдалося завантажити PNG"); }
  });
  document.getElementById("print-receipt")?.addEventListener("click", () => window.print());

  document.getElementById("open-signature")?.addEventListener("click", () => {
    const dialog = document.getElementById("signature-dialog");
    const canvas = document.getElementById("signature-canvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#151515";
    let strokes = [], current = null;
    const point = (event) => { const rect=canvas.getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)), y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)) }; };
    canvas.onpointerdown = (event) => { event.preventDefault(); canvas.setPointerCapture(event.pointerId); current=[point(event)]; strokes.push(current); const p=current[0]; ctx.beginPath(); ctx.arc(p.x*canvas.width,p.y*canvas.height,2.5,0,Math.PI*2); ctx.fillStyle="#151515"; ctx.fill(); };
    canvas.onpointermove = (event) => { if(!current)return; event.preventDefault(); const p=point(event), prior=current.at(-1); current.push(p); ctx.beginPath(); ctx.moveTo(prior.x*canvas.width,prior.y*canvas.height); ctx.lineTo(p.x*canvas.width,p.y*canvas.height); ctx.stroke(); };
    const stop = () => { current=null; document.getElementById("save-signature").disabled = !strokes.some((stroke)=>stroke.length>1) || !document.getElementById("signature-consent").checked; };
    canvas.onpointerup=stop; canvas.onpointercancel=stop;
    document.getElementById("signature-consent").onchange = () => { document.getElementById("save-signature").disabled = !strokes.some((stroke)=>stroke.length>1) || !document.getElementById("signature-consent").checked; };
    document.getElementById("clear-signature").onclick = () => { ctx.clearRect(0,0,canvas.width,canvas.height); strokes=[]; current=null; document.getElementById("save-signature").disabled=true; };
    document.getElementById("save-signature").onclick = async (event) => {
      const button=event.currentTarget; button.disabled=true; button.textContent="Формуємо квитанцію…";
      try {
        const path=accountManaged?`${accountPath}/sign`:`/api/reservations/${encodeURIComponent(id)}/sign`;
        await api(path,{method:"POST",body:{...(accountManaged?{}:{token}),strokes}});
        dialog.close(); toast("Підпис додано до квитанції"); location.reload();
      } catch(error) { document.getElementById("signature-error").textContent=error.message; button.disabled=false; button.textContent="Підписати та зберегти квитанцію"; }
    };
    dialog.showModal();
  });
}

try {
  if (!id || (!token && !accountManaged)) throw new Error("Відкрийте сторінку з особистого посилання або сторінки «Мої бронювання».");
  const reservation = await api(accountManaged ? accountPath : `/api/reservations/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
  render(reservation);
} catch (error) {
  content.innerHTML = `<div class="reservation-message"><h2>Бронювання недоступне</h2><p>${escapeHtml(error.message)}</p><a class="btn" href="/my-reservations.html">Мої бронювання</a></div>`;
}
