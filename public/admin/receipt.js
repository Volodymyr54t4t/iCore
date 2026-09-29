import { receiptMarkup } from "/js/receipt.js";

const root = document.getElementById("admin-receipt");
const id = new URLSearchParams(location.search).get("order");

async function loadReceipt() {
  if (!id) throw new Error("У посиланні немає номера замовлення.");
  const response = await fetch("/api/admin/orders", { credentials: "include" });
  if (response.status === 401) {
    location.replace("/admin/login.html");
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не вдалося завантажити замовлення.");
  const order = data.find((entry) => String(entry.id) === String(id));
  if (!order) throw new Error("Замовлення не знайдено.");
  document.title = `Квитанція ${order.payment_receipt || `№${order.id}`} — LONDÉ by CVV`;
  root.innerHTML = receiptMarkup(order);
  document.getElementById("print-receipt").addEventListener("click", () => window.print());
}

loadReceipt().catch((error) => {
  root.innerHTML = `<section class="tracking-card tracking-error"><p class="cart-kicker">LONDÉ BY CVV</p><h1>Не вдалося створити квитанцію</h1><p>${String(error.message || "Спробуйте ще раз.").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]))}</p><a class="btn" href="/admin/index.html#orders">До замовлень</a></section>`;
});
