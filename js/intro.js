// Terzo manifesto: spiega il gioco dopo passphrase e guida all'installazione.
const SEEN_KEY = "advent-calendar.intro-seen.v1";

function wasSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    return;
  }
}

export function setupIntro() {
  const overlay = document.getElementById("intro");
  const help = document.getElementById("intro-help");
  if (!overlay) return;

  const app = document.querySelector(".app");
  const closeButton = document.getElementById("intro-close");
  const doneButton = document.getElementById("intro-done");
  const backdrop = overlay.querySelector("[data-intro-close]");
  const dialog = overlay.querySelector(".intro__card");

  if (help) help.hidden = false;

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
    document.body.classList.add("intro-open");
    if (app) {
      if ("inert" in app) app.inert = true;
      app.setAttribute("aria-hidden", "true");
    }
    doneButton.focus();
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove("intro-open");
    if (app) {
      if ("inert" in app) app.inert = false;
      app.removeAttribute("aria-hidden");
    }
    document.removeEventListener("keydown", onKeydown);
    rememberSeen();

    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  closeButton.addEventListener("click", close);
  doneButton.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  if (help) help.addEventListener("click", (event) => open(event));

  if (!wasSeen()) {
    window.setTimeout(open, 220);
  }
}
