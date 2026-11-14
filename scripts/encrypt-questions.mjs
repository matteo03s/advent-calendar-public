// Cifra questions.json in questions.enc.json.
// Uso: node scripts/encrypt-questions.mjs [input] [output]
// La passphrase viene chiesta a terminale; in alternativa si può usare ADVENT_PASSPHRASE.
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

async function askPassphrase() {
  if (process.env.ADVENT_PASSPHRASE) return process.env.ADVENT_PASSPHRASE;

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  process.stdout.write("Passphrase (non verrà mostrata): ");
  const answer = await new Promise((resolve) => rl.question("", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const input = process.argv[2] ?? "questions.json";
  const output = process.argv[3] ?? "questions.enc.json";

  if (!existsSync(input)) {
    console.error(`File non trovato: ${input}`);
    process.exit(1);
  }

  let questions;
  try {
    questions = JSON.parse(readFileSync(input, "utf8"));
  } catch (error) {
    console.error(`JSON non valido in ${input}: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    console.error(`${input} deve contenere un array di domande non vuoto.`);
    process.exit(1);
  }

  const passphrase = await askPassphrase();
  if (!passphrase.trim()) {
    console.error("La passphrase è vuota: nessun file scritto.");
    process.exit(1);
  }

  const iterations = 310000;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, iterations, 32, "sha256");

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(questions), "utf8"), cipher.final()]);
  const data = Buffer.concat([ciphertext, cipher.getAuthTag()]);

  const envelope = {
    version: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: salt.toString("base64"),
    },
    cipher: {
      name: "AES-GCM",
      iv: iv.toString("base64"),
      data: data.toString("base64"),
    },
  };

  writeFileSync(output, `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(`Cifrate ${questions.length} domande in ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
