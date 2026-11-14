// Interfaccia: viste, eventi e salvataggio. Non ricalcola punteggi o tentativi.
import {
  DEFAULT_POINTS,
  LAST_DAY,
  MAX_ANSWER_LENGTH,
  MAX_ATTEMPTS,
} from "./config.js";
import {
  DAY_STATUS,
  getCalendar,
  getDayStatus,
  getMaxScore,
  getProgress,
  getUnlockedThrough,
  parseDebugDate,
  questionPoints,
  requestHint,
  resolveNow,
  submitAnswer,
} from "./game.js";
import { getEntry, loadState, resetState, saveState } from "./state.js";
import { QuestionsLockedError, loadQuestions, unlockQuestions } from "./questions.js";
import { registerServiceWorker, setupInstallHint } from "./pwa.js";

// getMonth() è 0-based, come in game.js.
const DECEMBER = 11;

// Fasce fisse del resoconto: etichette, soglie e legenda vengono da qui.
const BANDS = [
  { min: 0, max: 149, label: "Sei na pippa" },
  { min: 150, max: 209, label: "Ci siamo quasi" },
  { min: 210, max: 250, label: "Brava scema" },
];

const STAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.7 6.1 6.6.6-5 4.4 1.5 6.5-5.8-3.3-5.8 3.3 1.5-6.5-5-4.4 6.6-.6z"/></svg>';

// Icone inline: nessuna libreria, ereditano currentColor.
const ICONS = {
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  bulb:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9V16h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="10.5" width="14" height="9.5" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

// Formattazione in italiano, sempre in ora locale.
const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Riferimenti al DOM, raccolti una volta sola.
const $ = (id) => document.getElementById(id);

const dom = {
  app: document.querySelector(".app"),
  today: $("today-label"),
  heroNote: $("hero-note"),
  debug: $("debug-badge"),
  scoreValue: $("score-value"),
  openReport: $("open-report"),
  homeHint: $("home-hint"),
  grid: $("grid"),
  loadError: $("load-error"),
  views: {
    home: $("view-home"),
    question: $("view-question"),
    report: $("view-report"),
  },
  backHome: $("back-home"),
  backHomeReport: $("back-home-report"),
  questionDay: $("question-day"),
  questionStatus: $("question-status"),
  questionTitle: $("question-title"),
  attempts: $("attempts"),
  form: $("answer-form"),
  input: $("answer-input"),
  counter: $("counter"),
  hintBtn: $("hint-btn"),
  hintWarning: $("hint-warning"),
  hintBox: $("hint-box"),
  hintText: $("hint-text"),
  feedback: $("feedback"),
  reveal: $("reveal"),
  revealText: $("reveal-text"),
  reportScore: $("report-score"),
  reportMax: $("report-max"),
  reportMaxChip: $("report-max-chip"),
  reportBand: $("report-band"),
  reportNote: $("report-note"),
  reportList: $("report-list"),
  bandList: $("band-list"),
  treeTiers: Array.from(document.querySelectorAll(".tree__tier")),
  treeStar: document.querySelector(".tree__star"),
  confetti: $("confetti"),
  gate: $("gate"),
  gateForm: $("gate-form"),
  gateInput: $("gate-input"),
  gateError: $("gate-error"),
  gateSubmit: $("gate-submit"),
};

// Stato di UI in memoria: solo lo stato di gioco viene persistito.
let state = loadState();
let questions = null;
let currentDay = null;
let confettiFrame = 0;
let installHintShown = false;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const currentNow = () => resolveNow(window.location.search);

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Le tre viste sono sezioni con hidden: niente routing, niente cronologia.
function showView(name) {
  for (const [key, element] of Object.entries(dom.views)) {
    element.hidden = key !== name;
  }
  document.body.dataset.view = name;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setFeedback(text, tone) {
  dom.feedback.textContent = text;
  dom.feedback.className = `feedback feedback--${tone}`;
}

function clearFeedback() {
  dom.feedback.textContent = "";
  dom.feedback.className = "feedback";
}

// Testata: data locale, nota sullo sblocco e punteggio.
function renderHeader(now = currentNow()) {
  const progress = getProgress(state, now, questions);
  const unlocked = getUnlockedThrough(now);

  dom.today.textContent = capitalize(dateFormatter.format(now));
  dom.scoreValue.textContent = `${progress.score}/${progress.maxScore}`;
  dom.openReport.setAttribute(
    "aria-label",
    `Punteggio ${progress.score} su ${progress.maxScore}. Apri il resoconto.`
  );

  if (unlocked === 0) {
    dom.heroNote.textContent = "Il calendario si apre il 1° dicembre.";
  } else if (unlocked === LAST_DAY) {
    dom.heroNote.textContent = "Tutte le caselle sono aperte.";
  } else {
    dom.heroNote.textContent = `Oggi si apre la casella ${unlocked} di 24.`;
  }

  const debugDate = parseDebugDate(window.location.search);
  if (debugDate) {
    dom.debug.hidden = false;
    dom.debug.textContent = `debug · ${dateFormatter.format(debugDate)}`;
  } else {
    dom.debug.hidden = true;
    dom.debug.textContent = "";
  }
}

// Caselle: carta per giorno, stato e aria-label descrittivo.
function doorLabel(day, isToday, maxPoints) {
  const base = `Giorno ${day.day}`;
  const bonus = maxPoints > DEFAULT_POINTS ? `, bonus da ${maxPoints} punti` : "";
  if (day.status === DAY_STATUS.solved) {
    return `${base}${bonus}, ${day.usedHint ? "corretto con indizio" : "corretto"}, ${day.points} punti`;
  }
  if (day.status === DAY_STATUS.failed) return `${base}${bonus}, sbagliato, 0 punti`;
  if (day.status === DAY_STATUS.locked) return `${base}${bonus}, ancora chiuso`;
  return `${base}${bonus}, ${isToday ? "oggi, " : ""}da giocare`;
}

function doorMark(day, maxPoints) {
  if (day.status === DAY_STATUS.locked) {
    return `<span class="door__mark">${ICONS.lock}</span>`;
  }
  if (day.status === DAY_STATUS.solved) {
    return day.usedHint
      ? `<span class="door__mark door__mark--hint">${ICONS.bulb}${day.points}</span>`
      : `<span class="door__mark door__mark--ok">${ICONS.check}${day.points}</span>`;
  }
  if (day.status === DAY_STATUS.failed) {
    return `<span class="door__mark door__mark--ko">${ICONS.cross}0</span>`;
  }
  if (maxPoints > DEFAULT_POINTS) {
    return `<span class="door__mark door__mark--bonus">${STAR_ICON}${maxPoints}</span>`;
  }
  return '<span class="door__mark">da giocare</span>';
}

function doorElement(day, todayDay) {
  const isToday = todayDay !== null && day.day === todayDay;
  const maxPoints = questionPoints(questions?.get(day.day));
  const bonus = maxPoints > DEFAULT_POINTS;
  const paper = (day.day % 4) + 1;
  const lift = [0, 5, 2, 7][day.day % 4];
  const tilt = ((((day.day * 37) % 5) - 2) * 0.5).toFixed(2);
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = `door door--${day.status} door--paper-${paper}${
    isToday ? " door--today" : ""
  }${bonus ? " door--bonus" : ""}`;
  button.dataset.day = String(day.day);
  button.style.setProperty("--tilt", `${tilt}deg`);
  button.style.setProperty("--lift", `${lift}px`);
  button.disabled = day.status === DAY_STATUS.locked;
  button.setAttribute("aria-label", doorLabel(day, isToday, maxPoints));
  button.innerHTML = `
    ${isToday ? '<span class="door__tape" aria-hidden="true"></span><span class="door__badge">oggi</span>' : ""}
    <span class="door__num">${day.day}</span>
    ${doorMark(day, maxPoints)}
  `;
  item.append(button);
  return item;
}

function renderHome(now = currentNow()) {
  const dayOfMonth = now.getDate();
  const todayDay =
    now.getMonth() === DECEMBER && dayOfMonth <= LAST_DAY ? dayOfMonth : null;
  const calendar = getCalendar(state, now);
  dom.grid.replaceChildren(...calendar.map((day) => doorElement(day, todayDay)));

  const progress = getProgress(state, now, questions);
  if (progress.locked === LAST_DAY) {
    dom.homeHint.textContent = "Torna il 1° dicembre: la prima casella si aprirà da sola.";
  } else if (progress.locked === 0) {
    dom.homeHint.textContent = "Tutte le caselle sono aperte: puoi recuperare i giorni saltati.";
  } else {
    dom.homeHint.textContent = "Tocca una casella aperta per giocare o rivedere l'esito.";
  }
}

function closedFeedback(entry, question) {
  if (entry.status === "solved") {
    const message = question?.feedbackCorrect ?? "Risposta corretta.";
    return `${message} +${entry.points} ${entry.points === 1 ? "punto" : "punti"}.`;
  }
  const message = question?.feedbackWrong ?? "Risposta sbagliata.";
  return `${message} Nessun punto per questa casella.`;
}

// I punti possibili scendono a metà quando l'indizio è attivo.
function renderQuestion() {
  if (currentDay === null) return;

  const now = currentNow();
  const question = questions?.get(currentDay) ?? null;
  const entry = getEntry(state, currentDay);
  const closed = Boolean(entry && entry.status !== "playing");
  const attemptsLeft = entry ? Math.max(0, MAX_ATTEMPTS - entry.attempts) : MAX_ATTEMPTS;
  const usedHint = entry?.usedHint === true;
  const totalPoints = questionPoints(question);
  const possiblePoints = usedHint ? Math.floor(totalPoints / 2) : totalPoints;

  dom.questionDay.textContent = `Giorno ${currentDay}`;
  dom.questionTitle.textContent = question?.question ?? "Domanda non disponibile per questo giorno.";
  dom.questionStatus.textContent = closed
    ? entry.status === "solved"
      ? `Chiusa · ${entry.points} punti`
      : "Chiusa · 0 punti"
    : `${possiblePoints} punti`;

  dom.attempts.textContent = closed
    ? "Domanda conclusa"
    : attemptsLeft === 1
      ? "1 tentativo rimasto"
      : `${attemptsLeft} tentativi rimasti`;

  const playable = Boolean(question) && !closed;
  dom.form.hidden = !playable;
  dom.hintBtn.hidden = !playable || usedHint;
  dom.hintWarning.hidden = !playable || usedHint;
  dom.hintWarning.textContent = `Con l'indizio il massimo scende a ${Math.floor(
    totalPoints / 2
  )} punti.`;
  dom.hintBox.hidden = !usedHint;
  dom.hintText.textContent = usedHint ? question?.hint ?? "" : "";

  dom.input.value = "";
  dom.counter.textContent = `0/${MAX_ANSWER_LENGTH}`;
  dom.input.disabled = !playable;

  dom.reveal.hidden = !closed;
  dom.revealText.textContent = closed ? (question?.answers ?? []).join(" · ") : "";

  clearFeedback();
  if (closed) {
    setFeedback(
      closedFeedback(entry, question),
      entry.status === "solved" ? "correct" : "wrong"
    );
  } else if (usedHint && question?.hint) {
    setFeedback(`Indizio attivo: il massimo per questa casella è ${possiblePoints} punti.`, "warn");
  }
}

function openDay(day, source) {
  const status = getDayStatus(state, day, currentNow());
  if (!status || status.status === DAY_STATUS.locked) return;

  const enter = () => {
    currentDay = day;
    renderQuestion();
    showView("question");
    dom.questionTitle.focus({ preventScroll: true });
  };

  if (!source || prefersReducedMotion()) {
    enter();
    return;
  }

  source.classList.add("is-opening");
  window.setTimeout(() => {
    source.classList.remove("is-opening");
    enter();
  }, 220);
}

function bindGrid() {
  dom.grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-day]");
    if (!button || button.disabled) return;
    openDay(Number(button.dataset.day), button);
  });
}

// Dopo un invio valido si chiude la tastiera iOS (blur); per gli errori resta il focus.
function handleSubmit(event) {
  event.preventDefault();
  if (currentDay === null) return;

  const now = currentNow();
  const question = questions?.get(currentDay) ?? null;
  const outcome = submitAnswer(state, currentDay, question, dom.input.value, now);

  if (outcome.result.reason === "empty") {
    setFeedback("Scrivi una risposta prima di inviare.", "warn");
    dom.input.focus();
    return;
  }

  if (outcome.result.reason === "too_long") {
    setFeedback(`Massimo ${MAX_ANSWER_LENGTH} caratteri.`, "warn");
    return;
  }

  if (outcome.result.reason === "locked" || outcome.result.reason === "invalid_day") {
    renderHeader(now);
    renderHome(now);
    showView("home");
    return;
  }

  saveState(state);
  renderHeader(now);
  renderHome(now);
  renderQuestion();
  dom.input.blur();

  if (outcome.result.correct) {
    fireConfetti();
    return;
  }

  if (!outcome.closed) {
    setFeedback(
      `${question?.feedbackWrong ?? "Non è quella giusta."} Ti resta un tentativo.`,
      "wrong"
    );
  }
}

function handleHint() {
  if (currentDay === null) return;

  const now = currentNow();
  const outcome = requestHint(state, currentDay, now);
  if (!outcome.ok) return;

  const question = questions?.get(currentDay) ?? null;
  const cap = Math.floor(questionPoints(question) / 2);

  saveState(state);
  renderHeader(now);
  renderHome(now);
  renderQuestion();
  setFeedback(`Indizio svelato: da ora il massimo è ${cap} punti.`, "warn");
}

function bandIndexFor(score) {
  if (score >= BANDS[2].min) return 2;
  if (score >= BANDS[1].min) return 1;
  return 0;
}

// Resoconto: numeri grandi, albero a fasce e riga per giorno.
function renderReport(now = currentNow()) {
  const progress = getProgress(state, now, questions);
  const bandIndex = bandIndexFor(progress.score);
  const band = BANDS[bandIndex];

  dom.reportScore.textContent = String(progress.score);
  dom.reportMax.textContent = `/ ${progress.maxScore}`;
  dom.reportMaxChip.textContent = `${progress.maxScore} max`;
  dom.reportBand.textContent = band.label;

  dom.treeTiers.forEach((tier, index) => {
    tier.classList.toggle("is-on", index <= bandIndex);
  });
  dom.treeStar.classList.toggle("is-on", bandIndex === 2);

  for (const item of dom.bandList.querySelectorAll("[data-band]")) {
    const index = Number(item.dataset.band);
    const label = item.querySelector(".bands__label");
    if (label && BANDS[index]) label.textContent = BANDS[index].label;
    item.classList.toggle("is-current", index === bandIndex);
    if (index === bandIndex) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  }

  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  dom.reportNote.textContent = [
    plural(progress.solved, "corretta", "corrette"),
    plural(progress.failed, "sbagliata", "sbagliate"),
    plural(progress.available, "da giocare", "da giocare"),
    plural(progress.locked, "ancora chiusa", "ancora chiuse"),
  ].join(" · ");

  const rows = getCalendar(state, now).map((day) => {
    const item = document.createElement("li");
    item.className = `report__row${day.status === DAY_STATUS.locked ? " report__row--locked" : ""}`;

    let label = "ancora chiusa";
    let tone = "";
    let points = "—";

    if (day.status === DAY_STATUS.solved) {
      label = day.usedHint ? "corretto con indizio" : "corretto";
      tone = day.usedHint ? "hint" : "solved";
      points = `+${day.points}`;
    } else if (day.status === DAY_STATUS.failed) {
      label = "sbagliato";
      tone = "failed";
      points = "0";
    } else if (day.status === DAY_STATUS.available) {
      label = "da giocare";
    }

    item.innerHTML = `
      <span class="report__day">${day.day}</span>
      <span class="report__label">
        <span class="report__status report__status--${tone}" aria-hidden="true"></span>
        ${label}
      </span>
      <span class="report__points">${points}</span>
    `;
    return item;
  });

  dom.reportList.replaceChildren(...rows);
}

// Coriandoli su canvas; nessun rAF se l'utente preferisce meno movimento.
function fireConfetti() {
  if (prefersReducedMotion()) return;

  const canvas = dom.confetti;
  const context = canvas.getContext("2d");
  if (!context) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const colors = ["#e0b268", "#d2645b", "#8fc7a8", "#f7f0e1", "#a8762f"];
  const particles = Array.from({ length: 90 }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 120,
    y: height * 0.34,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 12 - 4,
    size: 4 + Math.random() * 7,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  const started = performance.now();

  const draw = (time) => {
    const elapsed = time - started;
    context.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.vy += 0.36;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.995;
      particle.rotation += particle.spin;

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      context.globalAlpha = Math.max(0, 1 - elapsed / 2400);
      context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
      context.restore();
    }

    if (elapsed < 2400) {
      confettiFrame = requestAnimationFrame(draw);
    } else {
      context.clearRect(0, 0, width, height);
      confettiFrame = 0;
    }
  };

  confettiFrame = requestAnimationFrame(draw);
}

// Su iOS la tastiera non ridimensiona il layout: si scrolla la visual viewport.
function keepInputVisible() {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const rect = dom.form.getBoundingClientRect();
  const limit = viewport.offsetTop + viewport.height - 16;
  if (rect.bottom <= limit) return;

  window.scrollBy({
    top: rect.bottom - limit + 24,
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

// Gate: l'app resta inerte finché la passphrase non viene accettata.
function setGateError(message) {
  dom.gateError.hidden = !message;
  dom.gateError.textContent = message ?? "";
}

function openGate(message = "") {
  if (!dom.gate) return;
  dom.gate.hidden = false;
  document.body.classList.add("gate-open");
  if (dom.app) {
    if ("inert" in dom.app) dom.app.inert = true;
    dom.app.setAttribute("aria-hidden", "true");
  }
  setGateError(message);
  dom.gateInput.value = "";
  dom.gateInput.focus();
}

function closeGate() {
  if (!dom.gate) return;
  dom.gate.hidden = true;
  document.body.classList.remove("gate-open");
  if (dom.app) {
    if ("inert" in dom.app) dom.app.inert = false;
    dom.app.removeAttribute("aria-hidden");
  }
  setGateError("");
}

// Dopo lo sblocco (o il caricamento da chiave salvata) si può disegnare tutto e proporre l'installazione.
function questionsReady() {
  closeGate();
  renderHeader();
  renderHome();
  if (document.body.dataset.view === "report") renderReport();
  if (document.body.dataset.view === "question") renderQuestion();
  if (!installHintShown) {
    installHintShown = true;
    setupInstallHint();
  }
}

async function handleUnlock(event) {
  event.preventDefault();
  dom.gateSubmit.disabled = true;
  setGateError("");

  try {
    questions = await unlockQuestions(dom.gateInput.value);
    questionsReady();
  } catch (error) {
    const message = error instanceof QuestionsLockedError
      ? error.message
      : `Impossibile sbloccare: ${error.message}`;
    setGateError(message);
    dom.gateInput.select();
  } finally {
    dom.gateSubmit.disabled = false;
  }
}

// Eventi: delegazione sulla griglia e azioni delle viste.
function bindEvents() {
  dom.openReport.addEventListener("click", () => {
    renderReport();
    showView("report");
  });

  dom.backHome.addEventListener("click", () => {
    dom.input.blur();
    renderHeader();
    renderHome();
    showView("home");
  });

  dom.backHomeReport.addEventListener("click", () => {
    dom.input.blur();
    renderHeader();
    renderHome();
    showView("home");
  });

  dom.form.addEventListener("submit", handleSubmit);
  dom.hintBtn.addEventListener("click", handleHint);
  dom.gateForm.addEventListener("submit", handleUnlock);

  dom.input.addEventListener("input", () => {
    dom.counter.textContent = `${dom.input.value.length}/${MAX_ANSWER_LENGTH}`;
  });

  dom.input.addEventListener("focus", () => {
    window.setTimeout(keepInputVisible, 320);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === dom.input) keepInputVisible();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const now = currentNow();
    renderHeader(now);
    renderHome(now);
    if (document.body.dataset.view === "report") renderReport(now);
  });
}

function cleanUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debugReset") !== "1") return;
  resetState();
  params.delete("debugReset");
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
  );
}

// L'app può restare aperta: al cambio di data si ridisegna tutto e il timer si riarma.
function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  const delay = Math.min(Math.max(nextMidnight.getTime() - now.getTime(), 1000), 2147483647);

  window.setTimeout(() => {
    const fresh = currentNow();
    renderHeader(fresh);
    renderHome(fresh);
    if (document.body.dataset.view === "report") renderReport(fresh);
    if (document.body.dataset.view === "question" && currentDay !== null) renderQuestion();
    scheduleMidnightRefresh();
  }, delay);
}

// Bootstrap: reset da URL, stato, domande (cifrate) e service worker.
async function init() {
  cleanUrl();
  state = loadState();
  bindGrid();
  bindEvents();
  renderHeader();
  renderHome();
  scheduleMidnightRefresh();
  registerServiceWorker();

  try {
    questions = await loadQuestions();
    dom.loadError.hidden = true;
    questionsReady();
  } catch (error) {
    if (error instanceof QuestionsLockedError) {
      openGate(error.message);
      return;
    }

    dom.loadError.hidden = false;
    dom.loadError.textContent = `Problema con le domande: ${error.message}`;
  }
}

init();
