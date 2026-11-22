// Validazione dei dati: involucro cifrato sempre, contenuto in chiaro solo se presente in locale.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { normalize } from "../js/match.js";
import { MAX_ANSWER_LENGTH } from "../js/config.js";
import { isUsableQuestion } from "../js/questions.js";

const ENCRYPTED_PATH = new URL("../questions.enc.json", import.meta.url);
const PLAIN_PATH = new URL("../questions.json", import.meta.url);

function validateQuestions(questions) {
  assert.equal(Array.isArray(questions), true);

  const days = questions.map((item) => item.day).sort((a, b) => a - b);
  assert.deepEqual(days, Array.from({ length: 24 }, (_, index) => index + 1));

  for (const item of questions) {
    const label = `day ${item.day}`;
    assert.equal(Number.isInteger(item.day), true, `${label}: day non intero`);
    assert.equal(typeof item.question, "string", `${label}: question non stringa`);
    assert.equal(item.question.trim().length > 0, true, `${label}: question vuota`);
    assert.equal(Array.isArray(item.answers), true, `${label}: answers non array`);
    assert.equal(item.answers.length > 0, true, `${label}: answers vuoto`);

    for (const answer of item.answers) {
      assert.equal(typeof answer, "string", `${label}: answer non stringa`);
      assert.equal(
        normalize(answer).length > 0,
        true,
        `${label}: answer vuota dopo normalizzazione`
      );
      assert.equal(
        normalize(answer).length <= MAX_ANSWER_LENGTH,
        true,
        `${label}: answer più lunga del limite di input (${answer})`
      );
    }

    assert.equal(typeof item.hint, "string", `${label}: hint non stringa`);
    assert.equal(item.hint.trim().length > 0, true, `${label}: hint vuoto`);

    if (item.points !== undefined) {
      assert.equal(Number.isInteger(item.points), true, `${label}: points non intero`);
      assert.equal(item.points > 0, true, `${label}: points non positivo`);
      assert.equal(item.points <= 100, true, `${label}: points eccessivo`);
    }

    if (item.matchMode !== undefined) {
      assert.equal(
        ["contains", "exact"].includes(item.matchMode),
        true,
        `${label}: matchMode sconosciuto (${item.matchMode})`
      );
    }

    if (item.type !== undefined) {
      assert.equal(
        ["open", "choice"].includes(item.type),
        true,
        `${label}: type sconosciuto (${item.type})`
      );
    }

    if (item.type === "choice") {
      assert.equal(Array.isArray(item.options), true, `${label}: options non array`);
      assert.equal(item.options.length >= 2, true, `${label}: servono almeno 2 opzioni`);
      const options = item.options.map(normalize);
      assert.equal(
        new Set(options).size,
        options.length,
        `${label}: opzioni duplicate dopo normalizzazione`
      );
      assert.equal(
        options.some((option) => item.answers.map(normalize).includes(option)),
        true,
        `${label}: nessuna risposta accettata corrisponde a un'opzione`
      );
    }

    for (const field of ["feedbackCorrect", "feedbackWrong"]) {
      if (item[field] === undefined) continue;
      assert.equal(typeof item[field], "string", `${label}: ${field} non stringa`);
      assert.equal(item[field].trim().length > 0, true, `${label}: ${field} vuoto`);
    }

    const normalized = item.answers.map(normalize);
    assert.equal(
      new Set(normalized).size,
      normalized.length,
      `${label}: answers duplicate dopo normalizzazione`
    );
  }
}

test("questions.enc.json ha l'involucro atteso e non contiene domande in chiaro", () => {
  const raw = readFileSync(ENCRYPTED_PATH, "utf8");
  const envelope = JSON.parse(raw);

  assert.equal(envelope.version, 1);
  assert.equal(envelope.kdf.name, "PBKDF2");
  assert.equal(envelope.kdf.hash, "SHA-256");
  assert.equal(Number.isInteger(envelope.kdf.iterations), true);
  assert.equal(envelope.kdf.iterations > 0, true);
  assert.equal(envelope.cipher.name, "AES-GCM");
  assert.equal(typeof envelope.kdf.salt, "string");
  assert.equal(typeof envelope.cipher.iv, "string");
  assert.equal(typeof envelope.cipher.data, "string");
  assert.match(raw, /^[\s\S]*"data"/);
  assert.doesNotMatch(raw, /"question"\s*:/);
});

test("isUsableQuestion valida le domande a scelta multipla", () => {
  const choice = {
    day: 1,
    question: "Dove?",
    answers: ["Pisa"],
    hint: "Toscana",
    type: "choice",
    options: ["Roma", "Pisa", "Firenze"],
  };

  assert.equal(isUsableQuestion(choice), true);
  assert.equal(isUsableQuestion({ ...choice, options: ["Roma", "Firenze"] }), false);
  assert.equal(isUsableQuestion({ ...choice, options: ["Pisa", "pisa"] }), false);
  assert.equal(isUsableQuestion({ ...choice, answers: ["Siena"] }), false);
  assert.equal(isUsableQuestion({ ...choice, type: "quiz" }), false);
  assert.equal(isUsableQuestion({ ...choice, type: "open" }), true);
  assert.equal(
    isUsableQuestion({ ...choice, answers: ["pisa"], options: ["Roma", "Pisa!"] }),
    true
  );
});

test("questions.json in chiaro, quando esiste in locale, resta valido", {
  skip: !existsSync(PLAIN_PATH),
}, () => {
  validateQuestions(JSON.parse(readFileSync(PLAIN_PATH, "utf8")));
});
