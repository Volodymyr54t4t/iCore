import { api, mountNav } from "./api.js";

await mountNav();

const form = document.getElementById("contact-form");
const status = document.getElementById("contact-status");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  status.textContent = "";
  submit.disabled = true;
  submit.textContent = "Надсилаємо…";
  try {
    await api("/api/contact", { method: "POST", body: Object.fromEntries(data) });
    form.reset();
    status.className = "contact-status is-success";
    status.textContent = "Дякуємо! Повідомлення вже у нас. Відповімо якомога швидше.";
  } catch (error) {
    status.className = "contact-status";
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.innerHTML = "Надіслати повідомлення <span>→</span>";
  }
});
