// Domande cifrate: nel repo pubblico va solo il ciphertext, la passphrase non entra in git.
import { FIRST_DAY, LAST_DAY } from "./config.js";
import { normalize } from "./match.js";

const QUESTIONS_URL = "./questions.enc.json";
const KEY_STORAGE = "advent-calendar.questions-key.v1";
const DEFAULT_ITERATIONS = 310000;
const QUESTION_TYPES = new Set(["open", "choice"]);

export class QuestionsLockedError extends Error {
  constructor(message = "") {
    super(message);
    this.name = "QuestionsLockedError";
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

// Valida una domanda: `type` e `options` sono opzionali, le domande senza type restano aperte.
export function isUsableQuestion(item) {
  if (!item || typeof item !== "object") return false;
  if (!Number.isInteger(item.day) || item.day < FIRST_DAY || item.day > LAST_DAY) return false;
  if (typeof item.question !== "string" || !item.question.trim()) return false;
  if (!Array.isArray(item.answers)) return false;
  if (!item.answers.some((answer) => typeof answer === "string" && answer.trim())) return false;
  if (item.type !== undefined && !QUESTION_TYPES.has(item.type)) return false;

  if (item.type === "choice") {
    if (!Array.isArray(item.options) || item.options.length < 2) return false;
    if (!item.options.every((option) => typeof option === "string" && option.trim())) return false;
    const options = item.options.map(normalize);
    if (new Set(options).size !== options.length) return false;
    const answers = item.answers
      .filter((answer) => typeof answer === "string" && answer.trim())
      .map(normalize);
    if (!answers.some((answer) => options.includes(answer))) return false;
  }

  return true;
}

function parseQuestions(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le domande decifrate non sono JSON valido.");
  }

  if (!Array.isArray(data)) {
    throw new Error("questions.json deve contenere un array di domande");
  }

  const byDay = new Map();
  for (const item of data) {
    if (!isUsableQuestion(item) || byDay.has(item.day)) continue;
    byDay.set(item.day, item);
  }

  if (byDay.size === 0) {
    throw new Error("questions.json non contiene domande valide");
  }

  return byDay;
}

function readStoredKey() {
  try {
    const raw = window.localStorage.getItem(KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.key !== "string" || !parsed.key) return null;
    return base64ToBytes(parsed.key);
  } catch {
    return null;
  }
}

function storeKey(rawKey) {
  try {
    window.localStorage.setItem(KEY_STORAGE, JSON.stringify({ key: bytesToBase64(rawKey) }));
  } catch {
    return;
  }
}

export function forgetQuestionsKey() {
  try {
    window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    return;
  }
}

// Legge e valida l'involucro cifrato; qui non c'è ancora nessuna domanda in chiaro.
function readEnvelope(envelope) {
  const kdf = envelope?.kdf;
  const cipher = envelope?.cipher;
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !kdf ||
    typeof kdf.salt !== "string" ||
    !cipher ||
    typeof cipher.iv !== "string" ||
    typeof cipher.data !== "string"
  ) {
    throw new Error("Formato delle domande non valido.");
  }

  const iterations = Number.isInteger(kdf.iterations) && kdf.iterations > 0
    ? kdf.iterations
    : DEFAULT_ITERATIONS;

  try {
    return {
      salt: base64ToBytes(kdf.salt),
      iv: base64ToBytes(cipher.iv),
      data: base64ToBytes(cipher.data),
      iterations,
    };
  } catch {
    throw new Error("Formato delle domande non valido.");
  }
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );
}

async function decryptText(parts, key) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: parts.iv }, key, parts.data);
  return new TextDecoder().decode(plain);
}

// Usata anche dai test: decifra un involucro con una passphrase, senza toccare lo storage.
export async function decryptQuestions(envelope, passphrase) {
  const parts = readEnvelope(envelope);
  const key = await deriveKey(String(passphrase ?? ""), parts.salt, parts.iterations);
  return parseQuestions(await decryptText(parts, key));
}

async function fetchEnvelope(url) {
  let response;
  try {
    response = await fetch(url, { cache: "no-cache" });
  } catch (error) {
    throw new Error(`questions.enc.json non raggiungibile (${error.message})`);
  }

  if (!response.ok) {
    throw new Error(`questions.enc.json non raggiungibile (HTTP ${response.status})`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("questions.enc.json non è un JSON valido.");
  }
}

// Prova con la chiave salvata sul dispositivo; senza chiave (o se non è più valida) chiede la passphrase.
export async function loadQuestions(url = QUESTIONS_URL) {
  const envelope = await fetchEnvelope(url);
  const stored = readStoredKey();
  if (!stored) throw new QuestionsLockedError();

  let key;
  try {
    key = await crypto.subtle.importKey("raw", stored, "AES-GCM", false, ["decrypt"]);
  } catch {
    forgetQuestionsKey();
    throw new QuestionsLockedError();
  }

  try {
    return parseQuestions(await decryptText(readEnvelope(envelope), key));
  } catch {
    forgetQuestionsKey();
    throw new QuestionsLockedError("La chiave salvata non è più valida. Reinserisci la parola d'ordine.");
  }
}

// Deriva la chiave dalla passphrase, decifra e salva la chiave per i prossimi avvii.
export async function unlockQuestions(passphrase, url = QUESTIONS_URL) {
  const phrase = String(passphrase ?? "");
  if (!phrase.trim()) {
    throw new QuestionsLockedError("La parola d'ordine non può essere vuota.");
  }

  const envelope = await fetchEnvelope(url);
  const parts = readEnvelope(envelope);

  let key;
  let text;
  try {
    key = await deriveKey(phrase, parts.salt, parts.iterations);
    text = await decryptText(parts, key);
  } catch {
    throw new QuestionsLockedError("Parola d'ordine errata.");
  }

  const questions = parseQuestions(text);
  const raw = await crypto.subtle.exportKey("raw", key);
  storeKey(new Uint8Array(raw));
  return questions;
}
