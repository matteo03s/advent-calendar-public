// Regole: sblocco per data, punteggi, tentativi, indizio e persistenza.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY_STATUS,
  applyAnswer,
  getCalendar,
  getDayStatus,
  getMaxScore,
  getProgress,
  getTotalScore,
  getUnlockedThrough,
  isDayUnlocked,
  isFinalUnlocked,
  parseDebugDate,
  questionPoints,
  requestHint,
  resolveNow,
  submitAnswer,
  applyHint,
} from "../js/game.js";
import { createEmptyState, getEntry, loadState, saveState } from "../js/state.js";
import { MAX_ANSWER_LENGTH, MAX_ATTEMPTS, STORAGE_KEY } from "../js/config.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const question = (day, answers = ["cinese"], extra = {}) => ({
  day,
  question: "Come si chiama il ristorante?",
  answers,
  hint: "Indizio di test",
  ...extra,
});

const december = (day, hours = 12, minutes = 0) => new Date(2026, 11, day, hours, minutes);
const november = (day) => new Date(2026, 10, day, 12, 0);

test("sblocco: prima di dicembre nessun giorno, dal 1 al 24 il giorno corrente, dopo il 24 tutti", () => {
  assert.equal(getUnlockedThrough(november(1)), 0);
  assert.equal(getUnlockedThrough(november(30)), 0);
  assert.equal(getUnlockedThrough(december(1)), 1);
  assert.equal(getUnlockedThrough(december(5)), 5);
  assert.equal(getUnlockedThrough(december(24)), 24);
  assert.equal(getUnlockedThrough(december(25)), 24);
  assert.equal(getUnlockedThrough(december(31, 23, 59)), 24);
});

test("l'album finale si sblocca il 24 dicembre", () => {
  assert.equal(isFinalUnlocked(november(30)), false);
  assert.equal(isFinalUnlocked(december(23)), false);
  assert.equal(isFinalUnlocked(december(24)), true);
  assert.equal(isFinalUnlocked(december(25)), true);
});

test("sblocco: cambio giorno a mezzanotte con ora locale del dispositivo", () => {
  assert.equal(getUnlockedThrough(new Date(2026, 10, 30, 23, 59, 59, 999)), 0);
  assert.equal(getUnlockedThrough(new Date(2026, 11, 1, 0, 0, 0, 0)), 1);
  assert.equal(getUnlockedThrough(new Date(2026, 11, 1, 23, 59, 59, 999)), 1);
  assert.equal(getUnlockedThrough(new Date(2026, 11, 2, 0, 0, 0, 0)), 2);

  const localMidnight = new Date("2026-12-05T00:15:00");
  assert.equal(localMidnight.getDate(), 5);
  assert.equal(getUnlockedThrough(localMidnight), 5);
});

test("sblocco: date invalide o input non Date sbloccano zero giorni", () => {
  assert.equal(getUnlockedThrough(new Date("nope")), 0);
  assert.equal(getUnlockedThrough("2026-12-05"), 0);
  assert.equal(getUnlockedThrough(undefined), 0);
});

test("isDayUnlocked rispetta range e data", () => {
  assert.equal(isDayUnlocked(1, december(1)), true);
  assert.equal(isDayUnlocked(2, december(1)), false);
  assert.equal(isDayUnlocked(24, december(25)), true);
  assert.equal(isDayUnlocked(0, december(24)), false);
  assert.equal(isDayUnlocked(25, december(25)), false);
});

test("parseDebugDate accetta solo YYYY-MM-DD valide e resolveNow la usa", () => {
  const parsed = parseDebugDate("?debugDate=2026-12-05");
  assert.equal(parsed instanceof Date, true);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 11);
  assert.equal(parsed.getDate(), 5);

  assert.equal(parseDebugDate("?debugDate=2026-12-05&debugReset=1").getDate(), 5);
  assert.equal(parseDebugDate("?debugDate=2026-02-30"), null);
  assert.equal(parseDebugDate("?debugDate=2026-13-01"), null);
  assert.equal(parseDebugDate("?debugDate=05/12/2026"), null);
  assert.equal(parseDebugDate("?debugDate="), null);
  assert.equal(parseDebugDate(""), null);
  assert.equal(parseDebugDate(undefined), null);

  const fallback = december(10);
  assert.equal(resolveNow("", fallback), fallback);
  assert.equal(resolveNow("?debugDate=boh", fallback), fallback);
  assert.equal(getUnlockedThrough(resolveNow("?debugDate=2026-12-14", fallback)), 14);
});

test("risposta corretta al primo tentativo senza indizio vale 10 punti", () => {
  const state = createEmptyState();
  const outcome = submitAnswer(state, 2, question(2), "Eravamo dal cinese", december(2));

  assert.equal(outcome.result.correct, true);
  assert.equal(outcome.result.matched, "cinese");
  assert.equal(outcome.points, 10);
  assert.equal(outcome.closed, true);
  assert.equal(getEntry(state, 2).status, "solved");
  assert.equal(getEntry(state, 2).points, 10);
  assert.equal(getEntry(state, 2).attempts, 0);
  assert.equal(getEntry(state, 2).usedHint, false);
  assert.deepEqual(getEntry(state, 2).guesses, ["Eravamo dal cinese"]);
  assert.equal(getTotalScore(state), 10);
});

test("risposta corretta al secondo tentativo senza indizio vale comunque 10 punti", () => {
  const state = createEmptyState();
  submitAnswer(state, 3, question(3, ["pisa"]), "roma", december(3));
  const outcome = submitAnswer(state, 3, question(3, ["pisa"]), "Pisa", december(3));

  assert.equal(outcome.result.correct, true);
  assert.equal(outcome.points, 10);
  assert.equal(getEntry(state, 3).attempts, 1);
  assert.equal(getEntry(state, 3).status, "solved");
  assert.deepEqual(getEntry(state, 3).guesses, ["roma", "Pisa"]);
  assert.equal(getTotalScore(state), 10);
});

test("indizio abbassa il massimo a 5 punti, anche indovinando al primo colpo", () => {
  const state = createEmptyState();
  const hint = requestHint(state, 4, december(4));

  assert.equal(hint.ok, true);
  assert.equal(hint.entry.usedHint, true);
  assert.equal(hint.entry.status, "playing");
  assert.equal(hint.entry.points, null);

  const outcome = submitAnswer(state, 4, question(4), "cinese", december(4));
  assert.equal(outcome.points, 5);
  assert.equal(getEntry(state, 4).points, 5);
  assert.equal(getEntry(state, 4).usedHint, true);
  assert.equal(getTotalScore(state), 5);
});

test("due risposte sbagliate chiudono il giorno a 0 punti e non è rigiocabile", () => {
  const state = createEmptyState();
  const q = question(5);

  const first = submitAnswer(state, 5, q, "pizza", december(5));
  assert.equal(first.closed, false);
  assert.equal(first.points, null);
  assert.equal(getEntry(state, 5).status, "playing");
  assert.equal(getEntry(state, 5).attempts, 1);

  const second = submitAnswer(state, 5, q, "sushi", december(5));
  assert.equal(second.result.correct, false);
  assert.equal(second.closed, true);
  assert.equal(second.points, 0);
  assert.equal(getEntry(state, 5).status, "failed");
  assert.equal(getEntry(state, 5).attempts, MAX_ATTEMPTS);

  const replay = submitAnswer(state, 5, q, "cinese", december(5));
  assert.equal(replay.result.reason, "not_playable");
  assert.equal(replay.result.correct, false);
  assert.equal(getEntry(state, 5).status, "failed");
  assert.equal(getEntry(state, 5).points, 0);
  assert.deepEqual(getEntry(state, 5).guesses, ["pizza", "sushi"]);

  assert.equal(requestHint(state, 5, december(5)).reason, "closed");
  assert.equal(getTotalScore(state), 0);
});

test("input vuoto o troppo lungo non consuma tentativi e non crea entry", () => {
  const state = createEmptyState();
  const q = question(6);

  assert.equal(submitAnswer(state, 6, q, "   ", december(6)).result.reason, "empty");
  assert.equal(getEntry(state, 6), null);

  const tooLong = "cinese ".repeat(10).slice(0, MAX_ANSWER_LENGTH + 1);
  assert.equal(submitAnswer(state, 6, q, tooLong, december(6)).result.reason, "too_long");
  assert.equal(getEntry(state, 6), null);

  const outcome = submitAnswer(state, 6, q, "cinese", december(6));
  assert.equal(outcome.result.correct, true);
  assert.equal(getEntry(state, 6).attempts, 0);
  assert.equal(getEntry(state, 6).points, 10);
});

test("un giorno non ancora sbloccato non è giocabile", () => {
  const state = createEmptyState();
  const now = december(10);

  const outcome = submitAnswer(state, 11, question(11), "cinese", now);
  assert.equal(outcome.result.reason, "locked");
  assert.equal(getEntry(state, 11), null);
  assert.equal(requestHint(state, 11, now).reason, "locked");
  assert.equal(getEntry(state, 11), null);

  assert.equal(submitAnswer(state, 25, question(25), "cinese", now).result.reason, "invalid_day");
  assert.equal(requestHint(state, 0, now).reason, "invalid_day");
});

test("i giorni passati non giocati sono recuperabili a punteggio pieno", () => {
  const state = createEmptyState();
  const now = december(22);

  const outcome = submitAnswer(state, 2, question(2), "cinese", now);
  assert.equal(outcome.points, 10);
  assert.equal(getDayStatus(state, 2, now).status, DAY_STATUS.solved);
  assert.equal(getDayStatus(state, 2, now).usedHint, false);
  assert.equal(getTotalScore(state), 10);
});

test("getDayStatus espone stato, indizio, tentativi e sblocco di ogni giorno", () => {
  const state = createEmptyState();
  const now = december(8);
  requestHint(state, 7, now);
  submitAnswer(state, 7, question(7), "sbagliata", now);
  submitAnswer(state, 1, question(1, ["pisa"]), "pisa", now);

  const locked = getDayStatus(state, 20, now);
  assert.equal(locked.status, DAY_STATUS.locked);
  assert.equal(locked.unlocked, false);
  assert.equal(locked.playable, false);
  assert.equal(locked.entry, null);

  const available = getDayStatus(state, 8, now);
  assert.equal(available.status, DAY_STATUS.available);
  assert.equal(available.playable, true);
  assert.equal(available.points, null);
  assert.equal(available.attemptsLeft, MAX_ATTEMPTS);

  const playing = getDayStatus(state, 7, now);
  assert.equal(playing.status, DAY_STATUS.available);
  assert.equal(playing.usedHint, true);
  assert.equal(playing.attempts, 1);
  assert.equal(playing.attemptsLeft, 1);

  const solved = getDayStatus(state, 1, now);
  assert.equal(solved.status, DAY_STATUS.solved);
  assert.equal(solved.points, 10);
  assert.equal(solved.playable, false);

  assert.equal(getDayStatus(state, 99, now), null);
});

test("punteggio massimo: 240 senza dati, 250 con la domanda bonus da 20", () => {
  assert.equal(getMaxScore(), 240);
  assert.equal(getMaxScore(new Map()), 240);
  assert.equal(getMaxScore(new Map([[20, { day: 20, points: 20 }]])), 250);
  assert.equal(
    getMaxScore([{ day: 5, points: 20 }, { day: 6, points: 30 }]),
    22 * 10 + 20 + 30
  );
  assert.equal(getCalendar(createEmptyState(), december(1)).length, 24);

  const state = createEmptyState();
  const now = december(3);
  requestHint(state, 1, now);
  submitAnswer(state, 1, question(1), "cinese", now);
  submitAnswer(state, 2, question(2), "x", now);
  submitAnswer(state, 2, question(2), "y", now);

  const progress = getProgress(state, now);
  assert.deepEqual(progress, {
    score: 5,
    maxScore: 240,
    solved: 1,
    failed: 1,
    available: 1,
    locked: 21,
  });
  assert.equal(getProgress(state, now, new Map([[20, { day: 20, points: 20 }]])).maxScore, 250);
});

test("una domanda bonus vale il doppio e con indizio la metà", () => {
  const bonus = question(20, ["2"], { points: 20, matchMode: "exact" });
  const now = december(20);
  assert.equal(questionPoints(bonus), 20);
  assert.equal(questionPoints({ points: 0 }), 10);
  assert.equal(questionPoints({ points: "20" }), 10);
  assert.equal(questionPoints(undefined), 10);

  const clean = createEmptyState();
  const first = submitAnswer(clean, 20, bonus, "2", now);
  assert.equal(first.points, 20);
  assert.equal(getEntry(clean, 20).points, 20);
  assert.equal(getEntry(clean, 20).maxPoints, 20);

  const hinted = createEmptyState();
  requestHint(hinted, 20, now);
  const second = submitAnswer(hinted, 20, bonus, "2", now);
  assert.equal(second.points, 10);
  assert.equal(getEntry(hinted, 20).points, 10);
  assert.equal(getEntry(hinted, 20).maxPoints, 20);
  assert.equal(getTotalScore(hinted), 10);
});

test("applyAnswer e applyHint non modificano l'entry di input", () => {
  const entry = {
    status: "playing",
    attempts: 0,
    usedHint: false,
    points: null,
    guesses: [],
    updatedAt: null,
  };
  const now = december(5);

  const hinted = applyHint(entry, now);
  assert.equal(entry.usedHint, false);
  assert.equal(hinted.usedHint, true);

  const outcome = applyAnswer(entry, question(5), "cinese", now);
  assert.equal(entry.status, "playing");
  assert.equal(entry.points, null);
  assert.notEqual(outcome.entry, entry);
  assert.equal(outcome.entry.status, "solved");
  assert.equal(outcome.points, 10);
  assert.equal(outcome.entry.usedHint, false);
});

test("lo stato salvato in localStorage mantiene punti, tentativi e indizi", () => {
  const storage = memoryStorage();
  const state = createEmptyState();
  const now = december(12);

  requestHint(state, 9, now);
  submitAnswer(state, 9, question(9, ["tokyo", "tokio"], { matchMode: "exact" }), "Tokio", now);
  submitAnswer(state, 10, question(10), "sbagliata", now);
  submitAnswer(state, 10, question(10), "ancora sbagliata", now);

  assert.equal(saveState(state, storage), true);
  const restored = loadState(storage);

  assert.deepEqual(restored, state);
  assert.equal(getEntry(restored, 9).points, 5);
  assert.equal(getEntry(restored, 9).usedHint, true);
  assert.equal(getEntry(restored, 10).status, "failed");
  assert.equal(getEntry(restored, 10).attempts, 2);
  assert.equal(getTotalScore(restored), 5);
  assert.equal(getDayStatus(restored, 9, now).usedHint, true);
});

test("localStorage corrotto o assente non blocca il gioco", () => {
  const corrupted = memoryStorage({ [STORAGE_KEY]: "{rotto" });
  const state = loadState(corrupted);
  assert.deepEqual(state, createEmptyState());

  const outcome = submitAnswer(state, 2, question(2), "cinese", december(2));
  assert.equal(outcome.points, 10);
  assert.equal(saveState(state, corrupted), true);
  assert.equal(getTotalScore(loadState(corrupted)), 10);

  assert.deepEqual(loadState(null), createEmptyState());
  const noStorage = {
    getItem: () => {
      throw new Error("negato");
    },
    setItem: () => {
      throw new Error("negato");
    },
    removeItem: () => {
      throw new Error("negato");
    },
  };
  assert.deepEqual(loadState(noStorage), createEmptyState());
  assert.equal(saveState(createEmptyState(), noStorage), false);
});
