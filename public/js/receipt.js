const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const formatPrice = (value) => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDate = (value) => value ? new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const plural = (count, forms) => {
  const n = Math.abs(Number(count)) % 100;
  const last = n % 10;
  return forms[n > 10 && n < 20 ? 2 : last > 1 && last < 5 ? 1 : last === 1 ? 0 : 2];
};

export function receiptMarkup(order) {
  const paymentStatus = order.paymentStatus || order.payment_status;
  const orderStatus = order.status;
  const items = (order.items || []).map((item) => ({
    name: item.product_name || item.name || "Товар",
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  }));
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = Number(order.total || 0);
  const customerName = order.customerName || order.customer_name;
  const paid = paymentStatus === "confirmed";
  const paymentStatuses = {
    awaiting_confirmation: "Очікує підтвердження замовлення",
    awaiting_payment: "Очікується оплата",
    proof_submitted: "Переказ на перевірці",
    confirmed: "Оплату підтверджено",
    rejected: "Оплату не підтверджено",
    refunded: "Кошти повернено",
  };
  const orderStatuses = { new: "Очікує дзвінка", processing: "Підтверджено · в обробці", shipped: "Відправлено", done: "Доставлено", cancelled: "Скасовано" };
  return `<article class="receipt-sheet">
    <header class="receipt-header"><img src="/images/londe-logo.png" alt="LONDÉ by CVV" /><div><p class="receipt-overline">LONDÉ BY CVV · ДОКУМЕНТ ЗАМОВЛЕННЯ</p><h1>Квитанція<br /><em>про замовлення</em></h1></div><span class="receipt-seal">L<br /><small>CVV</small></span></header>
    <section class="receipt-meta"><div><small>НОМЕР ЗАМОВЛЕННЯ</small><b>${escapeHtml(order.receipt || order.payment_receipt || `№${order.id}`)}</b></div><div><small>ДАТА СТВОРЕННЯ</small><b>${escapeHtml(formatDate(order.created_at || order.createdAt))}</b></div><div><small>СТАТУС ЗАМОВЛЕННЯ</small><b>${escapeHtml(orderStatuses[orderStatus] || orderStatus || "—")}</b></div><div><small>СТАТУС ОПЛАТИ</small><b class="${paid ? "is-paid" : ""}">${escapeHtml(paymentStatuses[paymentStatus] || "Очікує оплати")}</b></div></section>
    <section class="receipt-items"><div class="receipt-section-heading"><div><p>ДЕТАЛІ ПОКУПКИ</p><h2>Ваш вибір</h2></div><span>${count} ${plural(count, ["ПОЗИЦІЯ", "ПОЗИЦІЇ", "ПОЗИЦІЙ"])}</span></div><div class="receipt-table-head"><span>ТОВАР</span><span>КІЛЬКІСТЬ</span><span>ЦІНА</span><span>СУМА</span></div>${items.map((item) => `<div class="receipt-line"><b>${escapeHtml(item.name)}</b><span>${item.quantity}</span><span>${formatPrice(item.price)}</span><strong>${formatPrice(item.price * item.quantity)}</strong></div>`).join("")}</section>
    <section class="receipt-bottom"><div class="receipt-delivery">${customerName ? `<p class="receipt-overline">ПОКУПЕЦЬ</p><b>${escapeHtml(customerName)}</b>` : ""}<p class="receipt-overline">ДОСТАВКА</p><b>${escapeHtml(order.city || "—")}</b><span>${escapeHtml(order.address || "Адресу не вказано")}</span><p class="receipt-overline">КОНТАКТИ LONDÉ</p><a href="tel:+380671400008">+38 067 140 00 08</a><a href="mailto:vova.chyzhevskyi@gmail.com">vova.chyzhevskyi@gmail.com</a></div><aside class="receipt-total-card"><span>Загальна кількість</span><b>${count} ${plural(count, ["товар", "товари", "товарів"])}</b><span class="receipt-total-label">РАЗОМ ЗА ЗАМОВЛЕННЯ</span><strong>${formatPrice(total)}</strong><small>${paid ? "Статус оплати підтверджено." : "Оплату ще не підтверджено. Підсумкова інформація доступна у відстеженні замовлення."}</small></aside></section>
    <p class="receipt-disclaimer">Інформаційний документ, сформований на основі даних замовлення. Не є фіскальним чеком і сам по собі не підтверджує факт оплати.</p>
    <footer class="receipt-footer"><span>LONDÉ BY CVV</span><span>Дякуємо, що обрали нас</span></footer>
    <button class="btn receipt-print" id="print-receipt" type="button">Друк / Зберегти PDF <span>↓</span></button>
  </article>`;
}
