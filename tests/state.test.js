// Storage: sanitizzazione, migrazione v1→v2 e tolleranza a dati corrotti.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyState,
  createEntry,
  getEntry,
  loadState,
  resetState,
  sanitizeState,
  saveState,
  setEntry,
  solvedCount,
  totalScore,
} from "../js/state.js";
import { MAX_ATTEMPTS, STORAGE_KEY } from "../js/config.js";

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

test("loadState senza storage disponibile ritorna stato vuoto", () => {
  assert.deepEqual(loadState(null), createEmptyState());
});

test("loadState su storage vuoto ritorna stato vuoto", () => {
  assert.deepEqual(loadState(memoryStorage()), createEmptyState());
});

test("loadState ignora JSON corrotto, versioni diverse e forme sbagliate", () => {
  assert.deepEqual(loadState(memoryStorage({ [STORAGE_KEY]: "{not json" })), createEmptyState());
  assert.deepEqual(
    loadState(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 0, entries: { 1: {} } }) })),
    createEmptyState()
  );
  assert.deepEqual(loadState(memoryStorage({ [STORAGE_KEY]: JSON.stringify([]) })), createEmptyState());
});

test("saveState e loadState fanno round-trip di una entry conclusa", () => {
  const storage = memoryStorage();
  const state = createEmptyState();
  setEntry(state, 3, {
    ...createEntry(),
    status: "solved",
    attempts: 1,
    usedHint: false,
    guesses: ["pisa"],
    updatedAt: "2025-12-03T09:00:00.000Z",
  });

  assert.equal(saveState(state, storage), true);
  assert.deepEqual(loadState(storage), {
    version: 2,
    entries: {
      3: {
        status: "solved",
        attempts: 1,
        usedHint: false,
        points: 10,
        maxPoints: 10,
        guesses: ["pisa"],
        updatedAt: "2025-12-03T09:00:00.000Z",
      },
    },
  });
});

test("i punti vengono ricalcolati da status, usedHint e maxPoints, non presi dal JSON", () => {
  const tampered = {
    version: 2,
    entries: {
      1: { status: "solved", usedHint: true, points: 999, attempts: 1, guesses: [] },
      2: { status: "failed", usedHint: false, points: 999, attempts: 1, guesses: [] },
      3: { status: "playing", usedHint: false, points: 50, attempts: 1, guesses: [] },
      4: { status: "solved", usedHint: false, points: 999, maxPoints: 20, guesses: [] },
      5: { status: "solved", usedHint: true, points: 999, maxPoints: 20, guesses: [] },
      6: { status: "solved", usedHint: false, maxPoints: -3, guesses: [] },
    },
  };

  const state = sanitizeState(tampered);
  assert.equal(getEntry(state, 1).points, 5);
  assert.equal(getEntry(state, 1).maxPoints, 10);
  assert.equal(getEntry(state, 2).points, 0);
  assert.equal(getEntry(state, 2).attempts, MAX_ATTEMPTS);
  assert.equal(getEntry(state, 3).points, null);
  assert.equal(getEntry(state, 4).points, 20);
  assert.equal(getEntry(state, 5).points, 10);
  assert.equal(getEntry(state, 6).maxPoints, 10);
  assert.equal(getEntry(state, 6).points, 10);
  assert.equal(totalScore(state), 45);
});

test("uno stato salvato con version 1 viene migrato a version 2 senza perdere i punti", () => {
  const legacy = {
    version: 1,
    entries: {
      1: { status: "solved", usedHint: false, attempts: 0, guesses: ["sei"], updatedAt: null },
      2: { status: "solved", usedHint: true, attempts: 1, guesses: [], updatedAt: null },
    },
  };

  const state = sanitizeState(legacy);
  assert.equal(state.version, 2);
  assert.equal(getEntry(state, 1).maxPoints, 10);
  assert.equal(getEntry(state, 1).points, 10);
  assert.equal(getEntry(state, 2).points, 5);
  assert.equal(totalScore(state), 15);
});

test("una versione sconosciuta produce uno stato vuoto", () => {
  assert.deepEqual(sanitizeState({ version: 99, entries: { 1: { status: "solved" } } }), createEmptyState());
});

test("le entry con day fuori range o status sconosciuto vengono normalizzate", () => {
  const state = sanitizeState({
    version: 1,
    entries: {
      0: { status: "solved" },
      25: { status: "solved" },
      "-1": { status: "solved" },
      abc: { status: "solved" },
      5: { status: "strano", attempts: 7, guesses: ["a", "b", "c", "d"] },
    },
  });

  assert.deepEqual(Object.keys(state.entries), ["5"]);
  assert.equal(getEntry(state, 5).status, "playing");
  assert.equal(getEntry(state, 5).attempts, MAX_ATTEMPTS);
  assert.deepEqual(getEntry(state, 5).guesses, ["c", "d"]);
});

test("totalScore e solvedCount derivano dalle entry", () => {
  const state = createEmptyState();
  setEntry(state, 1, { ...createEntry(), status: "solved", points: 10, usedHint: false, attempts: 1 });
  setEntry(state, 2, { ...createEntry(), status: "solved", points: 5, usedHint: true, attempts: 2 });
  setEntry(state, 3, { ...createEntry(), status: "failed", points: 0, attempts: 2 });
  setEntry(state, 4, createEntry());

  assert.equal(totalScore(state), 15);
  assert.equal(solvedCount(state), 2);
  assert.equal(getEntry(state, 4).points, null);
  assert.equal(getEntry(state, 99), null);
});

test("resetState rimuove la chiave", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "{}" });
  assert.equal(resetState(storage), true);
  assert.equal(storage.map.has(STORAGE_KEY), false);
});

test("saveState non lancia eccezioni con storage che fallisce", () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("quota");
    },
  };

  assert.equal(saveState(createEmptyState(), broken), false);
  assert.equal(resetState(broken), false);
});
