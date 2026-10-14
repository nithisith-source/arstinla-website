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

  const showNote = (message, ms = 5200) => {
    note.textContent = message;
    note.classList.add("is-visible");
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => note.classList.remove("is-visible"), ms);
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

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      showNote("บน iPhone/iPad: แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) → เลือก \"เพิ่มไปยังหน้าจอโฮม\"", 9000);
    } else if (/SamsungBrowser/i.test(ua)) {
      showNote("แตะเมนู ≡ ด้านล่าง → \"เพิ่มหน้าไปยัง\" → \"หน้าจอหลัก\"", 9000);
    } else if (/Line\//i.test(ua) || /FBAN|FBAV|Instagram/i.test(ua)) {
      showNote("เปิดลิงก์นี้ใน Chrome หรือ Safari ก่อน แล้วกด Install App อีกครั้ง", 9000);
    } else if (/Android/i.test(ua)) {
      showNote("แตะเมนู ⋮ มุมขวาบนของ Chrome → \"ติดตั้งแอป\" หรือ \"เพิ่มลงในหน้าจอหลัก\" (ถ้าเคยติดตั้งแล้ว ดูที่หน้าจอหลักได้เลย)", 10000);
    } else {
      showNote("กดไอคอนติดตั้ง ⊕ ที่ช่อง URL ด้านขวา หรือเมนู ⋮ → \"ติดตั้งแอป\"", 9000);
    }
  });
})();
