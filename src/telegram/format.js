export const STATUS = {
  new: "🆕 Нове",
  processing: "⚙️ В обробці",
  shipped: "🚚 Відправлено",
  done: "✅ Виконано",
  cancelled: "❌ Скасовано",
};

export const STATUSES = ["new", "processing", "shipped", "done", "cancelled"];

export function money(n) {
  return `${Number(n).toLocaleString("uk-UA")} ₴`;
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function clip(text, max = 700) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function userLabel(from) {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
  const username = from?.username ? `@${from.username}` : "";
  return [name, username].filter(Boolean).join(" ") || `id ${from?.id}`;
}
