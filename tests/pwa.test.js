// Guida di installazione: rilevamento piattaforma e testi per iOS/Android/desktop.
import test from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, installGuide } from "../js/pwa.js";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

test("detectPlatform riconosce iPhone e iPad", () => {
  assert.equal(detectPlatform(IPHONE_UA, 5), "ios");
  assert.equal(detectPlatform(IPAD_UA, 5), "ios");
});

test("detectPlatform riconosce iPadOS che si presenta come Macintosh", () => {
  assert.equal(detectPlatform(MAC_UA, 5), "ios");
  assert.equal(detectPlatform(MAC_UA, 0), "desktop");
});

test("detectPlatform riconosce Android e desktop", () => {
  assert.equal(detectPlatform(ANDROID_UA, 5), "android");
  assert.equal(detectPlatform(WINDOWS_UA, 0), "desktop");
});

test("ogni guida ha tre passi", () => {
  for (const platform of ["ios", "android", "desktop"]) {
    const guide = installGuide(platform);
    assert.equal(guide.steps.length, 3, `${platform}: numero di passi`);
    for (const step of guide.steps) {
      assert.equal(typeof step.text, "string", `${platform}: testo del passo`);
      assert.equal(step.text.length > 0, true, `${platform}: passo vuoto`);
      if (step.strong !== undefined) {
        assert.equal(typeof step.strong, "string", `${platform}: strong non stringa`);
      }
      if (step.after !== undefined) {
        assert.equal(typeof step.after, "string", `${platform}: after non stringa`);
      }
    }
  }
});

test("la guida iOS parla di Safari, Condividi e Home", () => {
  const text = installGuide("ios")
    .steps.map((step) => `${step.text}${step.strong ?? ""}${step.after ?? ""}`)
    .join(" ");

  assert.match(text, /Safari/);
  assert.match(text, /Condividi/);
  assert.match(text, /Aggiungi alla schermata Home/);
});

test("la guida Android parla di menu, Installa app e schermata Home", () => {
  const text = installGuide("android")
    .steps.map((step) => `${step.text}${step.strong ?? ""}${step.after ?? ""}`)
    .join(" ");

  assert.match(text, /menu ⋮/);
  assert.match(text, /Installa app/);
  assert.match(text, /schermata Home/);
  assert.doesNotMatch(text, /Safari/);
});

test("la guida desktop spiega l'icona di installazione", () => {
  const text = installGuide("desktop")
    .steps.map((step) => `${step.text}${step.strong ?? ""}${step.after ?? ""}`)
    .join(" ");

  assert.match(text, /Chrome o Edge/);
  assert.match(text, /icona di installazione/);
  assert.match(text, /Installa/);
});

test("l'avviso per browser interno cambia con la piattaforma", () => {
  assert.match(installGuide("ios").inApp, /Apri in Safari/);
  assert.match(installGuide("android").inApp, /Apri nel browser/);
  assert.equal(installGuide("desktop").inApp, "");
});

test("una piattaforma sconosciuta ricade sulla guida desktop", () => {
  assert.equal(installGuide("plan9"), installGuide("desktop"));
});
