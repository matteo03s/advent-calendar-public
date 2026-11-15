// PWA: registrazione del service worker, guida di installazione per piattaforma, dialog.
const DISMISS_KEY = "advent-calendar.install-hint.v1";

const IN_APP_PATTERN =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|TikTok|musical_ly|MicroMessenger|GSA\/|Twitter/i;

// Cambiano solo i passi: struttura, stile e copy di contorno restano identici.
const GUIDES = {
  ios: {
    steps: [
      { text: "Apri questo indirizzo con ", strong: "Safari" },
      { text: "Tocca ", strong: "Condividi", after: ": il quadrato con la freccia verso l'alto." },
      { text: "Scegli ", strong: "Aggiungi alla schermata Home", after: " e conferma." },
    ],
    inApp:
      "Sembra che questo link si sia aperto dentro un'app. Tocca il menu (⋯) e scegli «Apri in Safari»: da lì potrai aggiungerlo alla Home.",
  },
  android: {
    steps: [
      { text: "Apri questo indirizzo con ", strong: "Chrome", after: " o il browser predefinito." },
      { text: "Tocca il ", strong: "menu ⋮", after: " in alto a destra." },
      { text: "Scegli ", strong: "Installa app", after: " (o «Aggiungi alla schermata Home») e conferma." },
    ],
    inApp:
      "Sembra che questo link si sia aperto dentro un'app. Tocca il menu (⋮) e scegli «Apri nel browser»: da lì potrai installarla.",
  },
  desktop: {
    steps: [
      { text: "Apri il sito con ", strong: "Chrome o Edge" },
      { text: "Clicca l'", strong: "icona di installazione", after: " nella barra degli indirizzi (o il menu ⋮)." },
      { text: "Conferma ", strong: "Installa" },
    ],
    inApp: "",
  },
};

// iPadOS si presenta come "Macintosh": maxTouchPoints distingue tablet da desktop.
export function detectPlatform(
  userAgent = window.navigator.userAgent,
  maxTouchPoints = window.navigator.maxTouchPoints
) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export function installGuide(platform) {
  return GUIDES[platform] ?? GUIDES.desktop;
}

export function isStandalone() {
  const displayMode = window.matchMedia("(display-mode: standalone)").matches;
  return displayMode || window.navigator.standalone === true;
}

export function isInAppBrowser(userAgent = window.navigator.userAgent) {
  if (IN_APP_PATTERN.test(userAgent)) return true;
  return /Android/i.test(userAgent) && /; wv\)/i.test(userAgent);
}

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    return;
  }
}

function renderSteps(list, steps) {
  if (!list) return;

  list.replaceChildren(
    ...steps.map((step, index) => {
      const item = document.createElement("li");
      item.className = "steps__item";

      const number = document.createElement("span");
      number.className = "steps__num";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1);

      const body = document.createElement("span");
      body.append(step.text);

      if (step.strong) {
        const strong = document.createElement("strong");
        strong.textContent = step.strong;
        body.append(strong);
      }

      if (step.after) body.append(step.after);

      item.append(number, body);
      return item;
    })
  );
}

// Scope relativo: la registrazione funziona anche in una sottocartella di GitHub Pages.
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.warn("Service worker non registrato:", error);
    return null;
  }
}

// Overlay mostrato solo nel browser: dialog modale con focus trap e sfondo inerte.
// `onDone` viene chiamato quando la guida è stata mostrata e chiusa, oppure subito se non va mostrata.
export function setupInstallHint({ onDone } = {}) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (typeof onDone === "function") onDone();
  };

  const overlay = document.getElementById("install");
  const help = document.getElementById("install-help");
  if (!overlay) {
    finish();
    return;
  }

  const app = document.querySelector(".app");
  const closeButton = document.getElementById("install-close");
  const dismissButton = document.getElementById("install-dismiss");
  const backdrop = overlay.querySelector("[data-install-close]");
  const warning = document.getElementById("install-warn");
  const stepsList = document.getElementById("install-steps");
  const dialog = overlay.querySelector(".install__card");

  const guide = installGuide(detectPlatform());
  renderSteps(stepsList, guide.steps);

  if (isStandalone()) {
    overlay.hidden = true;
    if (help) help.hidden = true;
    finish();
    return;
  }

  if (help) help.hidden = false;

  if (warning && isInAppBrowser() && guide.inApp) {
    warning.hidden = false;
    warning.textContent = guide.inApp;
  }

  let lastFocus = null;

  function onKeydown(event) {
    if (event.key === "Escape") {
      close();
      return;
    }

    if (event.key !== "Tab" || !dialog) return;
    const focusable = dialog.querySelectorAll("button");
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(event) {
    lastFocus = event ? document.activeElement : null;
    overlay.hidden = false;
    document.body.classList.add("install-open");
    if (app) {
      if ("inert" in app) app.inert = true;
      app.setAttribute("aria-hidden", "true");
    }
    closeButton.focus();
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove("install-open");
    if (app) {
      if ("inert" in app) app.inert = false;
      app.removeAttribute("aria-hidden");
    }
    document.removeEventListener("keydown", onKeydown);
    rememberDismissal();

    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    finish();
  }

  closeButton.addEventListener("click", close);
  dismissButton.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  if (help) help.addEventListener("click", (event) => open(event));

  if (!wasDismissed()) {
    window.setTimeout(open, 350);
  } else {
    finish();
  }
}
