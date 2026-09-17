import { api } from "./api.js";

const form = document.getElementById("newsletter-form");
const status = document.getElementById("newsletter-status");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "";
  try {
    await api("/api/newsletter/subscribe", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    form.reset();
    status.className = "is-success";
    status.textContent = "Ви в списку! Наступна класна новина буде у вашій пошті.";
  } catch (error) {
    status.className = "";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
