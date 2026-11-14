// Compatibilità cifratura: il formato prodotto dallo script Node si decifra con WebCrypto.
import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { decryptQuestions } from "../js/questions.js";

const PASSPHRASE = "passphrase-di-test";

function encrypt(questions, passphrase = PASSPHRASE) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, 310000, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(questions), "utf8"), cipher.final()]);
  const data = Buffer.concat([ciphertext, cipher.getAuthTag()]);

  return {
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 310000, salt: salt.toString("base64") },
    cipher: { name: "AES-GCM", iv: iv.toString("base64"), data: data.toString("base64") },
  };
}

const sample = [
  { day: 1, question: "Quanti lati ha un esagono?", answers: ["6", "sei"], hint: "Pensa a esa-", points: 10 },
  { day: 20, question: "Domanda bonus?", answers: ["2", "due"], hint: "Due", points: 20 },
];

test("decryptQuestions decifra un payload prodotto con lo script Node", async () => {
  const questions = await decryptQuestions(encrypt(sample), PASSPHRASE);

  assert.equal(questions.size, 2);
  assert.equal(questions.get(1).question, "Quanti lati ha un esagono?");
  assert.equal(questions.get(20).points, 20);
});

test("una passphrase errata non decifra", async () => {
  await assert.rejects(() => decryptQuestions(encrypt(sample), "passphrase-sbagliata"));
});

test("un involucro incompleto viene rifiutato con un errore chiaro", async () => {
  await assert.rejects(
    () => decryptQuestions({ version: 1, kdf: {}, cipher: {} }, PASSPHRASE),
    /Formato delle domande non valido/
  );
});

test("il contenuto decifrato deve essere un array di domande valide", async () => {
  await assert.rejects(() => decryptQuestions(encrypt({ nope: true }), PASSPHRASE), /array di domande/);
  await assert.rejects(() => decryptQuestions(encrypt([]), PASSPHRASE), /domande valide/);

  const cleaned = await decryptQuestions(
    encrypt([
      { day: 0, question: "scartata", answers: ["x"], hint: "x" },
      { day: 1, question: "tenuta", answers: ["x"], hint: "x" },
      { day: 1, question: "duplicata", answers: ["x"], hint: "x" },
    ]),
    PASSPHRASE
  );

  assert.equal(cleaned.size, 1);
  assert.equal(cleaned.get(1).question, "tenuta");
});
