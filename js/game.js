// Regole di gioco pure: date locali, tentativi e punteggi. Nessun DOM, nessuno storage.
import {
  DEFAULT_POINTS,
  FIRST_DAY,
  LAST_DAY,
  MAX_ATTEMPTS,
} from "./config.js";
import { matchAnswer } from "./match.js";
import {
  computePoints,
  createEntry,
  getEntry,
  isValidDay,
  setEntry,
  totalScore,
} from "./state.js";

// getMonth() è 0-based: dicembre è 11.
const DECEMBER = 11;

export const DEBUG_DATE_PARAM = "debugDate";

export const DAY_STATUS = Object.freeze({
  locked: "locked",
  available: "available",
  solved: "solved",
  failed: "failed",
});

function toTimestamp(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

// Giorni sbloccati in base alla data locale: 0 fuori da dicembre, poi 1..24.
export function getUnlockedThrough(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 0;
  if (date.getMonth() < DECEMBER) return 0;
  return Math.min(Math.max(date.getDate(), FIRST_DAY), LAST_DAY);
}

export function isDayUnlocked(day, date = new Date()) {
  return isValidDay(day) && day <= getUnlockedThrough(date);
}

// L'album finale si apre quando tutte le caselle sono sbloccate (dal 24 dicembre in poi).
export function isFinalUnlocked(date = new Date()) {
  return getUnlockedThrough(date) >= LAST_DAY;
}

// Costruisce la data con componenti locali: "YYYY-MM-DD" da solo verrebbe letto come UTC.
export function parseDebugDate(search) {
  if (!search) return null;

  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const raw = params.get(DEBUG_DATE_PARAM);
  if (!raw) return null;

  const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw.trim());
  if (!parts) return null;

  const year = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function resolveNow(search = "", fallback = new Date()) {
  return parseDebugDate(search) ?? fallback;
}

// Massimo derivato dalle domande: 10 di default, 20 per la casella bonus.
export function getMaxScore(questions) {
  let total = 0;
  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    total += questionPoints(lookupQuestion(questions, day));
  }
  return total;
}

function lookupQuestion(questions, day) {
  if (!questions) return null;
  if (typeof questions.get === "function") return questions.get(day) ?? null;
  if (Array.isArray(questions)) return questions.find((item) => item?.day === day) ?? null;
  return null;
}

export function questionPoints(question) {
  const points = question?.points;
  return Number.isInteger(points) && points > 0 ? points : DEFAULT_POINTS;
}

export function getTotalScore(state) {
  return totalScore(state);
}

// Transizioni pure sulle entry: il chiamante decide quando salvare.
export function applyHint(entry, now = new Date()) {
  if (!entry || entry.status !== "playing" || entry.usedHint) return entry;
  return { ...entry, usedHint: true, updatedAt: toTimestamp(now) };
}

export function applyAnswer(entry, question, input, now = new Date()) {
  if (!entry || entry.status !== "playing") {
    return {
      entry: entry ?? null,
      result: { correct: false, reason: "not_playable", matched: null, normalized: "" },
      points: entry?.points ?? null,
      closed: Boolean(entry),
    };
  }

  const result = matchAnswer(input, question);

  if (result.reason === "empty" || result.reason === "too_long" || result.reason === "bad_question") {
    return { entry, result, points: entry.points, closed: false };
  }

  const guesses = [...entry.guesses, String(input ?? "").trim()].slice(-MAX_ATTEMPTS);
  const updatedAt = toTimestamp(now);
  const maxPoints = questionPoints(question);

  if (result.correct) {
    const points = computePoints("solved", entry.usedHint, maxPoints);
    return {
      entry: { ...entry, status: "solved", points, maxPoints, guesses, updatedAt },
      result,
      points,
      closed: true,
    };
  }

  const attempts = entry.attempts + 1;
  const failed = attempts >= MAX_ATTEMPTS;

  return {
    entry: {
      ...entry,
      status: failed ? "failed" : "playing",
      attempts,
      points: failed ? 0 : null,
      maxPoints,
      guesses,
      updatedAt,
    },
    result,
    points: failed ? 0 : null,
    closed: failed,
  };
}

export function requestHint(state, day, now = new Date()) {
  if (!isValidDay(day)) {
    return { ok: false, reason: "invalid_day", entry: null };
  }

  if (!isDayUnlocked(day, now)) {
    return { ok: false, reason: "locked", entry: getEntry(state, day) };
  }

  const existing = getEntry(state, day);
  if (existing && existing.status !== "playing") {
    return { ok: false, reason: "closed", entry: existing };
  }

  const entry = existing ?? { ...createEntry(), updatedAt: toTimestamp(now) };
  if (entry.usedHint) {
    return { ok: true, reason: "already", entry };
  }

  const updated = applyHint(entry, now);
  setEntry(state, day, updated);
  return { ok: true, reason: "hint", entry: updated };
}

// Applica una risposta solo se il giorno è sbloccato e la domanda è ancora aperta.
export function submitAnswer(state, day, question, input, now = new Date()) {
  if (!isValidDay(day)) {
    return {
      result: { correct: false, reason: "invalid_day", matched: null, normalized: "" },
      entry: null,
      points: null,
      closed: false,
    };
  }

  if (!isDayUnlocked(day, now)) {
    return {
      result: { correct: false, reason: "locked", matched: null, normalized: "" },
      entry: getEntry(state, day),
      points: null,
      closed: false,
    };
  }

  const existing = getEntry(state, day);
  const entry = existing ?? { ...createEntry(questionPoints(question)), updatedAt: toTimestamp(now) };
  const outcome = applyAnswer(entry, question, input, now);

  if (outcome.entry && outcome.entry !== entry) {
    setEntry(state, day, outcome.entry);
  }

  return outcome;
}

// Vista giorno per la UI: stato più dati derivati (tentativi rimasti, indizio, punti).
export function getDayStatus(state, day, now = new Date()) {
  if (!isValidDay(day)) return null;

  const entry = getEntry(state, day);
  const unlocked = isDayUnlocked(day, now);
  const entryStatus = entry?.status ?? null;

  let status;
  if (entryStatus === "solved") status = DAY_STATUS.solved;
  else if (entryStatus === "failed") status = DAY_STATUS.failed;
  else if (!unlocked) status = DAY_STATUS.locked;
  else status = DAY_STATUS.available;

  const attempts = entry?.attempts ?? 0;

  return {
    day,
    status,
    unlocked,
    entry,
    usedHint: entry?.usedHint === true,
    points: entry?.points ?? null,
    attempts,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
    playable: status === DAY_STATUS.available,
  };
}

export function getCalendar(state, now = new Date()) {
  const days = [];
  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    days.push(getDayStatus(state, day, now));
  }
  return days;
}

// Totali per testata e resoconto; maxScore dipende dalle domande caricate.
export function getProgress(state, now = new Date(), questions = null) {
  const calendar = getCalendar(state, now);
  return {
    score: getTotalScore(state),
    maxScore: getMaxScore(questions),
    solved: calendar.filter((day) => day.status === DAY_STATUS.solved).length,
    failed: calendar.filter((day) => day.status === DAY_STATUS.failed).length,
    available: calendar.filter((day) => day.status === DAY_STATUS.available).length,
    locked: calendar.filter((day) => day.status === DAY_STATUS.locked).length,
  };
}
