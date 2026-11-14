// Confronto risposte: normalizzazione, whole-word, exact e limite di lunghezza.
import test from "node:test";
import assert from "node:assert/strict";
import { matchAnswer, normalize } from "../js/match.js";
import { MAX_ANSWER_LENGTH } from "../js/config.js";

const containsQuestion = (answers, extra = {}) => ({
  day: 1,
  question: "Domanda di test",
  answers,
  hint: "indizio",
  ...extra,
});

const exactQuestion = (answers) =>
  containsQuestion(answers, { matchMode: "exact" });

test("normalize toglie accenti, maiuscole, punteggiatura e spazi multipli", () => {
  assert.equal(normalize("  Città   dell'Est!!  "), "citta dell est");
  assert.equal(normalize("PERCHÉ"), "perche");
  assert.equal(normalize("Caffè, cornetto; brioche?"), "caffe cornetto brioche");
  assert.equal(normalize("sì."), "si");
  assert.equal(normalize("è  già   tardi"), "e gia tardi");
});

test("normalize gestisce input non stringa", () => {
  assert.equal(normalize(null), "");
  assert.equal(normalize(undefined), "");
  assert.equal(normalize(42), "42");
});

test("contains: risposta accettata dentro una frase", () => {
  const result = matchAnswer("Eravamo dal cinese", containsQuestion(["cinese"]));
  assert.deepEqual(result, {
    correct: true,
    reason: "correct",
    matched: "cinese",
    normalized: "eravamo dal cinese",
  });
});

test("contains: accenti e maiuscole nell'input non contano", () => {
  assert.equal(matchAnswer("PERCHE", containsQuestion(["perché"])).correct, true);
  assert.equal(matchAnswer("la Città", containsQuestion(["città"])).correct, true);
});

test("contains: una parola accettata non deve matchare dentro un'altra parola", () => {
  assert.equal(matchAnswer("solenoide", containsQuestion(["sole"])).reason, "wrong");
  assert.equal(matchAnswer("cineserie", containsQuestion(["cinese"])).reason, "wrong");
  assert.equal(matchAnswer("solecchio", containsQuestion(["sole"])).reason, "wrong");
  assert.equal(matchAnswer("il sole", containsQuestion(["sole"])).correct, true);
});

test("contains: corrispondenza di sequenze di parole intere", () => {
  const question = containsQuestion(["ristorante cinese", "cinese"]);
  assert.equal(matchAnswer("RISTORANTE   cinese!!", question).matched, "ristorante cinese");
  assert.equal(matchAnswer("ero al ristorante cinese di via Roma", question).correct, true);
  assert.equal(matchAnswer("ristorantecinese", question).correct, false);
  assert.equal(matchAnswer("cinesi", question).correct, false);
});

test("contains è la modalità di default quando matchMode manca o è sconosciuto", () => {
  assert.equal(matchAnswer("dal cinese", containsQuestion(["cinese"])).correct, true);
  assert.equal(
    matchAnswer("dal cinese", containsQuestion(["cinese"], { matchMode: "fuzzy" })).correct,
    true
  );
});

test("exact: serve uguaglianza completa dopo normalizzazione", () => {
  assert.equal(matchAnswer("Sì.", exactQuestion(["si"])).correct, true);
  assert.equal(matchAnswer("  SI  ", exactQuestion(["sì"])).correct, true);
  assert.equal(matchAnswer("si certo", exactQuestion(["si"])).reason, "wrong");
  assert.equal(matchAnswer("42", exactQuestion(["42"])).correct, true);
  assert.equal(matchAnswer("42 punti", exactQuestion(["42"])).reason, "wrong");
  assert.equal(matchAnswer("4 2", exactQuestion(["42"])).reason, "wrong");
});

test("contains con risposta numerica accetta anche il numero dentro una frase", () => {
  assert.equal(matchAnswer("ho 42 anni", containsQuestion(["42"])).correct, true);
  assert.equal(matchAnswer("ho 142 anni", containsQuestion(["42"])).correct, false);
});

test("exact: una risposta accettata tra più varianti basta", () => {
  const question = exactQuestion(["tokyo", "tokio"]);
  assert.equal(matchAnswer("Tokyo", question).matched, "tokyo");
  assert.equal(matchAnswer("Tokio", question).matched, "tokio");
  assert.equal(matchAnswer("Tokyo Tower", question).reason, "wrong");
});

test("input vuoto o solo punteggiatura viene segnalato come empty", () => {
  assert.equal(matchAnswer("", containsQuestion(["cinese"])).reason, "empty");
  assert.equal(matchAnswer("   ", containsQuestion(["cinese"])).reason, "empty");
  assert.equal(matchAnswer("?!?!!", containsQuestion(["cinese"])).reason, "empty");
  assert.equal(matchAnswer(null, containsQuestion(["cinese"])).reason, "empty");
});

test("input oltre il limite viene segnalato come too_long, non come wrong", () => {
  const question = containsQuestion(["cinese"]);
  const tooLong = `${"cinese ".repeat(20)}`.slice(0, MAX_ANSWER_LENGTH + 1);
  assert.equal(tooLong.length > MAX_ANSWER_LENGTH, true);
  assert.deepEqual(matchAnswer(tooLong, question), {
    correct: false,
    reason: "too_long",
    matched: null,
    normalized: "",
  });
  assert.equal(matchAnswer("cinese", question).correct, true);
});

test("il limite di lunghezza è solo sul testo trimmato", () => {
  const question = containsQuestion(["cinese"]);
  const padded = `   ${"a".repeat(MAX_ANSWER_LENGTH)}   `;
  assert.equal(padded.trim().length, MAX_ANSWER_LENGTH);
  assert.notEqual(matchAnswer(padded, question).reason, "too_long");
});

test("domanda senza risposte valide viene segnalata come bad_question", () => {
  assert.equal(matchAnswer("qualcosa", { answers: [] }).reason, "bad_question");
  assert.equal(matchAnswer("qualcosa", {}).reason, "bad_question");
  assert.equal(matchAnswer("qualcosa", { answers: ["  ", "!!!"] }).reason, "bad_question");
});
