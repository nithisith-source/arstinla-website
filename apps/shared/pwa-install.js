(() => {
  "use strict";

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) await navigator.serviceWorker.register("./sw.js");
      } catch (error) {
        console.warn("PWA service worker registration failed", error);
      }
    });
  }

  if (standalone) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "arstinla-pwa-install";
  button.textContent = "Install App";
  button.setAttribute("aria-label", "ติดตั้งแอปลงในอุปกรณ์");

  const note = document.createElement("div");
  note.className = "arstinla-pwa-note";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");

  document.body.append(button, note);

  let installPrompt = null;
  let noteTimer = 0;

  const showNote = (message) => {
    note.textContent = message;
    note.classList.add("is-visible");
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => note.classList.remove("is-visible"), 5200);
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.dataset.ready = "true";
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
    showNote("ติดตั้งแอปเรียบร้อยแล้ว");
  });

  button.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice.outcome === "accepted") button.hidden = true;
      return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      showNote("บน iPhone/iPad: แตะ Share แล้วเลือก Add to Home Screen");
    } else {
      showNote("เลือก Install app หรือ Add to Home screen จากเมนูของเบราว์เซอร์");
    }
  });
})();
