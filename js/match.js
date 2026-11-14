// Normalizzazione e confronto tollerante delle risposte (nessun accesso al DOM).
import { MAX_ANSWER_LENGTH } from "./config.js";

// NFD separa gli accenti dai caratteri base; poi tutto ciò che non è a-z0-9 diventa spazio.
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, " ")
    .trim();
}

function resolveMode(question) {
  return question?.matchMode === "exact" ? "exact" : "contains";
}

function normalizeAcceptedAnswers(question) {
  if (!Array.isArray(question?.answers)) return [];
  return question.answers.map(normalize).filter(Boolean);
}

// Ritorna { correct, reason, matched, normalized }; reason è usato da UI e test.
export function matchAnswer(rawInput, question, options = {}) {
  const maxLength = options.maxLength ?? MAX_ANSWER_LENGTH;
  const raw = String(rawInput ?? "").trim();

  if (raw.length > maxLength) {
    return { correct: false, reason: "too_long", matched: null, normalized: "" };
  }

  const input = normalize(raw);
  if (!input) {
    return { correct: false, reason: "empty", matched: null, normalized: "" };
  }

  const answers = normalizeAcceptedAnswers(question);
  if (answers.length === 0) {
    return { correct: false, reason: "bad_question", matched: null, normalized: input };
  }

  const paddedInput = ` ${input} `;
  const mode = resolveMode(question);
  const matched = answers.find((answer) =>
    mode === "exact" ? answer === input : paddedInput.includes(` ${answer} `)
  );

  if (matched === undefined) {
    return { correct: false, reason: "wrong", matched: null, normalized: input };
  }

  return { correct: true, reason: "correct", matched, normalized: input };
}
