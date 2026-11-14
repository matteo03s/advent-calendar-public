// Persistenza in localStorage: schema versionato, sanitizzazione in lettura, punti derivati.
import {
  DEFAULT_POINTS,
  FIRST_DAY,
  LAST_DAY,
  MAX_ATTEMPTS,
  STATE_VERSION,
  STORAGE_KEY,
} from "./config.js";

// Status ammessi e versioni leggibili (la 1 è la migrazione senza maxPoints).
const ENTRY_STATUSES = new Set(["playing", "solved", "failed"]);
const SUPPORTED_VERSIONS = new Set([1, STATE_VERSION]);

export function isValidDay(day) {
  return Number.isInteger(day) && day >= FIRST_DAY && day <= LAST_DAY;
}

export function createEmptyState() {
  return { version: STATE_VERSION, entries: {} };
}

export function createEntry(maxPoints = DEFAULT_POINTS) {
  return {
    status: "playing",
    attempts: 0,
    usedHint: false,
    points: null,
    maxPoints,
    guesses: [],
    updatedAt: null,
  };
}

// I punti non sono mai fonte di verità: si ricalcolano da status, indizio e maxPoints.
export function computePoints(status, usedHint, maxPoints = DEFAULT_POINTS) {
  if (status === "solved") {
    return usedHint ? Math.floor(maxPoints / 2) : maxPoints;
  }
  if (status === "failed") return 0;
  return null;
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Normalizza una entry: scarta campi sconosciuti, limita i tentativi e ricalcola i punti.
function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;

  const status = ENTRY_STATUSES.has(raw.status) ? raw.status : "playing";
  const usedHint = raw.usedHint === true;
  const attempts = Number.isInteger(raw.attempts)
    ? Math.min(Math.max(raw.attempts, 0), MAX_ATTEMPTS)
    : 0;
  const guesses = Array.isArray(raw.guesses)
    ? raw.guesses.filter((guess) => typeof guess === "string").slice(-MAX_ATTEMPTS)
    : [];
  const maxPoints =
    Number.isInteger(raw.maxPoints) && raw.maxPoints > 0
      ? Math.min(raw.maxPoints, 100)
      : DEFAULT_POINTS;

  return {
    status,
    attempts: status === "failed" ? MAX_ATTEMPTS : attempts,
    usedHint,
    points: computePoints(status, usedHint, maxPoints),
    maxPoints,
    guesses,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

// Valida lo stato completo: giorni fuori range scartati, versioni vecchie migrate, corrotto → vuoto.
export function sanitizeState(parsed) {
  if (!parsed || typeof parsed !== "object" || !SUPPORTED_VERSIONS.has(parsed.version)) {
    return createEmptyState();
  }

  const source = parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
  const entries = {};

  for (const [key, value] of Object.entries(source)) {
    const day = Number(key);
    if (!isValidDay(day)) continue;
    const entry = sanitizeEntry(value);
    if (entry) entries[day] = entry;
  }

  return { version: STATE_VERSION, entries };
}

// Lo storage è iniettabile nei test; se manca (private mode, permessi) si gioca in memoria.
export function loadState(storage) {
  const store = resolveStorage(storage);
  if (!store) return createEmptyState();

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return createEmptyState();
  }
}

export function saveState(state, storage) {
  const store = resolveStorage(storage);
  if (!store) return false;

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state)));
    return true;
  } catch {
    return false;
  }
}

export function resetState(storage) {
  const store = resolveStorage(storage);
  if (!store) return false;

  try {
    store.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getEntry(state, day) {
  if (!isValidDay(day)) return null;
  return state?.entries?.[day] ?? null;
}

export function setEntry(state, day, entry) {
  if (!isValidDay(day) || !entry) return state;
  state.entries[day] = entry;
  return state;
}

export function totalScore(state) {
  return Object.values(state?.entries ?? {}).reduce(
    (sum, entry) => sum + (typeof entry?.points === "number" ? entry.points : 0),
    0
  );
}

export function solvedCount(state) {
  return Object.values(state?.entries ?? {}).filter((entry) => entry?.status === "solved").length;
}
