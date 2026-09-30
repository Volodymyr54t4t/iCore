const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
let installPrompt;
let dismissed = false;

function showInstallBanner() {
  if (isStandalone || dismissed || document.querySelector(".pwa-install-banner")) return;
  const banner = document.createElement("aside");
  banner.className = "pwa-install-banner";
  banner.setAttribute("aria-label", "Встановити додаток LONDÉ BY CVV");
  banner.innerHTML = `<img src="/images/londe-logo.png" alt="" /><span><b>LONDÉ завжди поруч</b><small>Додай магазин на головний екран</small></span><button class="pwa-install-action" type="button">Встановити</button><button class="pwa-install-close" type="button" aria-label="Закрити">×</button>`;
  document.body.append(banner);
  banner.querySelector(".pwa-install-action").addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      banner.remove();
    } else {
      banner.querySelector("small").textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? "У Safari натисни «Поділитися» → «На Початковий екран»"
        : "Відкрий меню браузера та обери «Встановити додаток»";
    }
  });
  banner.querySelector(".pwa-install-close").addEventListener("click", () => {
    dismissed = true;
    banner.remove();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  showInstallBanner();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  document.querySelector(".pwa-install-banner")?.remove();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("LONDÉ offline support is unavailable:", error);
    });
  }, { once: true });
}

if (!isStandalone) {
  window.addEventListener("load", () => setTimeout(showInstallBanner, 1800), { once: true });
}
