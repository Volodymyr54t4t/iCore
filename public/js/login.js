import { api, getCustomer, mountNav } from "./api.js";

await mountNav();

const next = new URLSearchParams(location.search).get("next") || "/account.html";
if (await getCustomer()) {
  location.replace(next);
}

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const mode = document.body.dataset.auth || (location.pathname.includes("register") ? "register" : "login");

function setMode(nextMode) {
  const isLogin = nextMode === "login";
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  document.querySelectorAll(".segmented-btn").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === nextMode);
  });
}

setMode(mode);

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";
  const btn = loginForm.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await api("/api/account/login", {
      method: "POST",
      body: { email: fd.get("email"), password: fd.get("password") },
    });
    location.replace(next);
  } catch (error) {
    errorEl.textContent = error.message;
    btn.disabled = false;
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(registerForm);
  const errorEl = document.getElementById("register-error");
  errorEl.textContent = "";
  const btn = registerForm.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await api("/api/account/register", {
      method: "POST",
      body: Object.fromEntries(fd.entries()),
    });
    location.replace(next);
  } catch (error) {
    errorEl.textContent = error.message;
    btn.disabled = false;
  }
});
