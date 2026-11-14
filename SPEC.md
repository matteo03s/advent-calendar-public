# SPEC — Calendario dell'Avvento

Fonte di verità del progetto. Se una decisione cambia: prima si aggiorna questo file, poi il codice.

## 1. Obiettivo e stack

Piccola web app statica usata come calendario dell'avvento: una domanda al giorno dal 1 al 24 dicembre, con tentativi, indizi, punteggio e stato persistente.

- HTML + CSS + JS vanilla con moduli ES nativi. Nessun framework, nessun bundler, nessun build step.
- PWA installabile (manifest + service worker), target primario iPhone / Safari (iOS 16.4+).
- Nessun backend: file statici, pubblicabili su GitHub Pages.
- Le domande in chiaro restano solo in locale (`questions.json`, ignorato da git); nel repo viaggia `questions.enc.json` cifrato con AES-GCM e una passphrase che non viene mai committata.
- Lo stato di gioco vive in `localStorage`.

## 2. Struttura dei file

```
advent-calendar/
├─ index.html                  # fatto — markup delle 3 viste
├─ manifest.webmanifest        # fatto — name, icone, start_url/scope relativi
├─ service-worker.js           # fatto — precache + cache versionata
├─ icons/
│  ├─ icon-192.png             # fatto
│  ├─ icon-512.png             # fatto
│  ├─ icon-512-maskable.png    # fatto (safe zone Android)
│  └─ apple-touch-icon.png     # fatto (180x180, senza trasparenza)
├─ css/
│  └─ style.css                # fatto — tema, griglia, card domanda, resoconto
├─ fonts/
│  ├─ caveat-latin.woff2       # fatto — font manoscritto self-hosted (OFL)
│  └─ OFL.txt                  # licenza SIL OFL 1.1 di Caveat
├─ js/
│  ├─ config.js                # fatto — costanti gioco/storage
│  ├─ match.js                 # fatto — normalizzazione + confronto risposte
│  ├─ state.js                 # fatto — load/save/sanitize localStorage
│  ├─ game.js                  # fatto — sblocco, tentativi, punteggi, stati giorno
│  ├─ questions.js             # fatto — fetch + decifratura + validazione domande
│  ├─ ui.js                    # fatto — bootstrap, viste, eventi, gate passphrase
│  └─ pwa.js                   # fatto — registrazione SW + schermata installazione
├─ scripts/
│  └─ encrypt-questions.mjs    # fatto — cifra questions.json → questions.enc.json
├─ questions.enc.json          # fatto — domande cifrate (unico file versionato)
├─ questions.json              # locale, in .gitignore (in chiaro, non nel repo)
├─ tests/
│  ├─ match.test.js            # fatto
│  ├─ state.test.js            # fatto
│  ├─ game.test.js             # fatto — punteggi, tentativi, indizio, sblocco, persistenza
│  ├─ questions.test.js        # fatto — involucro cifrato + JSON locale se presente
│  └─ questions-crypto.test.js # fatto — compatibilità Node ↔ WebCrypto
├─ package.json                # fatto — solo dev/test, nessuna dipendenza
├─ SPEC.md
└─ README.md
```

`ui.js` è l'unico entry point del browser (`<script type="module">` in `index.html`): bootstrap, viste, eventi e salvataggio dopo ogni azione. Non esiste un `app.js` separato.

## 3. Schema di `questions.json`

Il file in chiaro è **locale** (`.gitignore`); il repository e il deploy usano solo la versione cifrata. Array di 24 oggetti, uno per giorno (1–24), senza campi extra obbligatori.

| Campo | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `day` | number | sì | intero 1–24, unico |
| `question` | string | sì | testo della domanda |
| `answers` | string[] | sì | ≥1 forma accettata, breve |
| `hint` | string | sì | indizio mostrabile |
| `points` | number | no | valore della domanda, default `10`; il giorno 20 di esempio vale `20` (bonus) |
| `matchMode` | string | no | `"contains"` (default) oppure `"exact"` |
| `feedbackCorrect` | string | no | messaggio mostrato dopo risposta corretta |
| `feedbackWrong` | string | no | messaggio mostrato dopo risposta sbagliata |

```json
[
  {
    "day": 2,
    "question": "Come si chiama il ristorante cinese dove andiamo sempre?",
    "answers": ["cinese", "ristorante cinese"],
    "hint": "È nel tipo di cucina, non nel nome della via.",
    "matchMode": "contains",
    "feedbackCorrect": "Esatto!",
    "feedbackWrong": "Ci siamo stati mille volte..."
  }
]
```

Regole di redazione delle `answers`:

- brevi e senza articoli iniziali né apostrofi (`"cinese"`, non `"il ristorante cinese"`): la normalizzazione trasforma l'apostrofo in spazio, quindi `"l'amore"` diventa `"l amore"` e non matcha `"amore"`;
- usare `matchMode: "exact"` per risposte di 1–2 caratteri, numeri, `"sì"`/`"no"`, dove `contains` darebbe falsi positivi (`"42"` dentro `"142"` non è un problema, ma `"si"` dentro `"simpatico"` sì);
- non scrivere mai risposte accettate più lunghe di 60 caratteri: l'input utente è limitato a 60, quindi non potrebbero mai matchare.

### Cifratura e caricamento

- `questions.json` in chiaro non è versionato; nel repo c'è solo `questions.enc.json`.
- Formato dell'involucro: `{ version: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 310000, salt: base64 }, cipher: { name: "AES-GCM", iv: base64, data: base64(ciphertext||authTag) } }`.
- Generazione (manuale, una tantum): `node scripts/encrypt-questions.mjs` chiede la passphrase a terminale e scrive `questions.enc.json` partendo da `questions.json` (in alternativa `ADVENT_PASSPHRASE` per uso non interattivo). Lo script non è un build step: l'app resta statica.
- Decifratura nel browser (`js/questions.js`, WebCrypto): PBKDF2 deriva la chiave dalla passphrase, AES-GCM decifra, poi si valida l'array come sempre. La chiave derivata viene salvata come base64 in `localStorage` (`advent-calendar.questions-key.v1`) per non richiedere la passphrase a ogni avvio; se il file cifrato cambia e la chiave non è più valida, viene cancellata e il gate la richiede.
- Schermata `#gate`: dialog senza chiusura, app di sfondo `inert` + `aria-hidden`, focus sull'input; mostra l'errore solo dopo un tentativo errato. Dopo lo sblocco parte l'overlay di installazione.
- iOS: l'app installata può avere uno storage separato da Safari, quindi la passphrase va inserita una volta anche nella PWA; dopo, la chiave locale basta e l'app funziona offline.
- Limiti: chi conosce la passphrase (o ha accesso al dispositivo) può leggere le domande; una volta decifrate sono visibili nei DevTools. Serve a tenere le domande fuori dal repository e da sguardi casuali, non è DRM.
- **Prima della pubblicazione**: i commit precedenti contengono ancora il vecchio `questions.json` di esempio in chiaro. Cancellarlo in un commit successivo non lo rimuove dalla storia: serve `git filter-repo`/BFG o un repository nuovo.

## 4. Regole di gioco

Sblocco (data locale del dispositivo, nessun server; finestra riferita all'anno corrente):

| Data | Domande sbloccate |
|---|---|
| 1 gennaio – 30 novembre | 0 (il calendario non è ancora iniziato) |
| 1–24 dicembre | `min(giorno, 24)` |
| 25–31 dicembre | 24 (tutte) |

Una domanda è **disponibile** solo se `day <= giorniSbloccati`. Le domande già concluse mostrano sempre il loro esito salvato, indipendentemente dallo sblocco.

Per domanda:

- 2 tentativi.
- Valore della domanda: `points` nel JSON (default **10**). Nel calendario attuale il giorno 20 vale **20** (casella bonus), quindi il totale massimo è **250**.
- Risposta corretta al 1° o 2° tentativo senza indizio: **tutti i punti** della domanda (10, oppure 20 per il bonus).
- Risposta corretta con indizio richiesto: **metà dei punti** arrotondata per difetto (10 → 5, 20 → 10).
- Entrambi i tentativi sbagliati: **0 punti**, domanda chiusa come `failed`.
- L'indizio può essere chiesto in qualsiasi momento prima della chiusura (anche dopo un tentativo errato) e abbassa il tetto a metà valore; non consuma tentativi.
- Una domanda conclusa (`solved` o `failed`) non è rigiocabile: input disabilitato, esito e punti congelati.
- Una risposta vuota o troppo lunga è un errore di input: **non** consuma un tentativo e non crea alcuna entry.
- I giorni passati non giocati restano disponibili con punteggio pieno (nessuna penalità per il ritardo).
- Punteggio massimo: somma di `points` su tutte e 24 le domande (`getMaxScore(questions)`); con il JSON attuale `250`.

### API di gioco (`js/game.js`)

Modulo puro: nessun accesso al DOM, nessuna scrittura su storage (riceve e muta lo stato in memoria; il salvataggio è responsabilità di `ui.js`). Il parametro `now` è sempre un `Date` passato dal chiamante.

| Funzione | Ritorno |
|---|---|
| `getUnlockedThrough(date)` | numero di giorni sbloccati (0–24) per la data locale |
| `isDayUnlocked(day, date)` | boolean |
| `parseDebugDate(search)` / `resolveNow(search, fallback)` | `Date` dal `?debugDate=YYYY-MM-DD`, oppure `null` / `fallback` |
| `getDayStatus(state, day, now)` | `{ day, status, unlocked, entry, usedHint, points, attempts, attemptsLeft, playable }` |
| `getCalendar(state, now)` | array di 24 elementi come sopra |
| `questionPoints(question)` | `points` validato (intero > 0), altrimenti 10 |
| `getMaxScore(questions)` / `getTotalScore(state)` | massimo del calendario (250 con il JSON attuale, 240 senza dati) / punti correnti |
| `getProgress(state, now, questions)` | `{ score, maxScore, solved, failed, available, locked }` |
| `requestHint(state, day, now)` | `{ ok, reason, entry }` — `reason` in `hint \| already \| closed \| locked \| invalid_day` |
| `submitAnswer(state, day, question, input, now)` | `{ result, entry, points, closed }` |
| `applyHint(entry, now)` / `applyAnswer(entry, question, input, now)` | varianti pure sulle entry, senza toccare lo stato |

`status` di un giorno (`DAY_STATUS`): `locked` | `available` (include le domande iniziate e non chiuse) | `solved` | `failed`. Una domanda conclusa riporta sempre `solved`/`failed`, mai `locked`, così l'esito resta visibile anche fuori stagione. `usedHint` è esposto sempre, anche sui giorni conclusi.

Motivi di rifiuto in `submitAnswer` (oltre a quelli di `matchAnswer`): `locked`, `invalid_day`, `not_playable` (entry già chiusa).

## 5. Regola di confronto delle risposte

Implementata in `js/match.js` (`normalize`, `matchAnswer`), pura e senza DOM.

Normalizzazione applicata **sia** all'input sia a ogni risposta accettata, in quest'ordine:

1. `NFD` + rimozione dei segni diacritici (accenti): `città` → `citta`, `perché` → `perche`;
2. minuscolo;
3. ogni sequenza di caratteri non `[a-z0-9]` (punteggiatura, apostrofi, trattini, emoji) diventa **un** spazio;
4. `trim` (gli spazi multipli sono già collassati).

Risultato: solo lettere ASCII minuscole, cifre e spazi singoli.

Confronto:

- `contains` (default): corretta se una qualsiasi risposta accettata compare nel testo utente come **parola intera o sequenza di parole intere**. Implementazione: input e risposta vengono paddati con spazi e confrontati con `includes(" " + answer + " ")`. Quindi `sole` non matcha `solenoide`, `eravamo dal cinese` matcha `cinese`, `ristorante cinese` matcha `ristorante cinese`.
- `exact`: il testo normalizzato deve essere **identico** a una delle risposte accettate.
- `matchMode` assente o sconosciuto → `contains`.
- Lunghezza massima input: 60 caratteri **dopo il trim, prima della normalizzazione** (`MAX_ANSWER_LENGTH`). Oltre → rifiutato senza consumare tentativi.
- `matchAnswer` ritorna `{ correct, reason, matched, normalized }` con `reason` in `correct | wrong | empty | too_long | bad_question` (`bad_question` = domanda senza `answers` valide).
- Le risposte accettate sono confrontate nella loro forma normalizzata: `"Sì"` e `"si"` accettano `"SÌ."`.

## 6. Stato in `localStorage`

Chiave unica: `advent-calendar.state.v1` (costante `STORAGE_KEY` in `js/config.js`). Il nome della chiave resta `.v1` per non perdere i salvataggi esistenti; la versione dello schema è invece il campo interno `version` (oggi `2`). Valore: JSON serializzato.

```json
{
  "version": 2,
  "entries": {
    "1": {
      "status": "solved",
      "attempts": 1,
      "usedHint": false,
      "points": 10,
      "maxPoints": 10,
      "guesses": ["sei"],
      "updatedAt": "2025-12-01T18:42:11.000Z"
    },
    "20": {
      "status": "solved",
      "attempts": 0,
      "usedHint": true,
      "points": 10,
      "maxPoints": 20,
      "guesses": ["la risposta"],
      "updatedAt": "2025-12-20T20:10:03.000Z"
    }
  }
}
```

Campi di una entry (chiave = `day` come stringa):

| Campo | Tipo | Note |
|---|---|---|
| `status` | `"playing" \| "solved" \| "failed"` | `playing` = iniziata ma non conclusa |
| `attempts` | number | tentativi errati consumati, 0–2 |
| `usedHint` | boolean | indizio richiesto |
| `maxPoints` | number | valore della domanda al momento del gioco (10, 20 per il bonus) |
| `points` | number \| null | `null` finché `playing`; derivato: `maxPoints` / `floor(maxPoints/2)` / 0 |
| `guesses` | string[] | ultimi testi inviati (max 2), per debug/riepilogo |
| `updatedAt` | string \| null | ISO 8601 dell'ultima azione |

Regole di persistenza:

- si salva dopo **ogni** azione (indizio, tentativo, chiusura); `game.js` muta solo lo stato in memoria, `saveState` viene chiamato da `ui.js`;
- una entry viene creata solo alla prima azione reale su un giorno (indizio o risposta valida): aprire la casella e basta non scrive nulla;
- `points` non è mai fonte di verità: al caricamento viene ricalcolato da `status` + `usedHint` + `maxPoints` (anti-manomissione); `maxPoints` invalido o assente → 10;
- il punteggio totale è **derivato**: `somma(points)` su tutte le entry, non salvato (niente drift);
- `attempts` viene clampato a 0–2 e `status: "failed"` forza `attempts: 2`;
- **migrazione**: `version: 1` (senza `maxPoints`) viene accettata e convertita a `version: 2` con `maxPoints: 10`; versioni sconosciute, JSON invalido o `entries` non oggetto → stato vuoto;
- entry con `day` non intero fuori da 1–24 vengono scartate;
- `localStorage` non disponibile (Safari in navigazione privata o storage negato) → si gioca in memoria, `saveState` ritorna `false`, nessun crash.

API in `js/state.js`: `createEmptyState`, `createEntry`, `computePoints`, `loadState`, `saveState`, `resetState`, `sanitizeState`, `getEntry`, `setEntry`, `totalScore`, `solvedCount`, `isValidDay`.

## 7. Convenzioni

- **Percorsi relativi ovunque** (`./js/ui.js`, `./questions.enc.json`, `./manifest.webmanifest`, scope service worker `./`): l'app deve funzionare su GitHub Pages in sottocartella (`/repo/`).
- `questions.json` in chiaro è in `.gitignore`; si versiona solo `questions.enc.json`. La passphrase non va in file, commit o URL.
- Nessuna build, nessuna dipendenza runtime; `package.json` esiste solo per `npm test`. La cifratura è uno script Node manuale, non un passaggio di build.
- Test: `npm test` → `node --test` (scopre `tests/*.test.js`). I test importano i moduli ES direttamente.
- **Debug data**: `?debugDate=YYYY-MM-DD` (es. `?debugDate=2026-12-05`) sostituisce "oggi" per lo sblocco **e** per gli `updatedAt` salvati, così una sessione di debug è coerente. Deve essere una data valida in ora locale (mai `new Date("YYYY-MM-DD")`, che Safari interpreta come UTC): formato non valido → ignorato.
- `?debugReset=1` azzera lo stato salvato (utile per provare i 24 giorni).
- Date calcolate in ora locale del dispositivo (iOS/Safari), mai UTC, per evitare sblocchi sfasati.
- Nessun contenuto caricato da CDN: l'app funziona offline dopo la prima visita.
- iOS: `viewport-fit=cover` + `env(safe-area-inset-*)`, input con `font-size: 16px` per evitare lo zoom automatico, `<meta name="apple-mobile-web-app-capable" content="yes">`.
- HTML accessibile: input con `label`, feedback annunciati con `aria-live`, touch target ≥ 44px.

## 8. Interfaccia

Un solo documento, tre viste controllate da `hidden` (nessun routing, nessuna cronologia): `home`, `question`, `report`. `ui.js` legge lo stato una volta con `loadState`, lo passa a `game.js` e chiama `saveState` dopo ogni azione; non ricalcola mai punteggi o tentativi per conto proprio. `currentDay` è l'unico stato di UI che non viene persistito.

### Paleta e tipografia

- Direzione: un calendario di carta attaccato al muro la sera, non una superficie "premium". Sfondo notte prugna/bruno (`#241b1c` → `#1a1314`) con due aloni caldi molto leggeri e una texture neve appena percettibile.
- Carte di quattro tonalità che si alternano per giorno (crema `#f7ecd6`, cipria `#f2e0d5`, salvia spenta `#e8e6d2`, kraft `#efdcba`), grana di carta via SVG `feTurbulence` in `background-blend-mode: multiply` e su `.card::after`.
- Accenti: terracotta `#a8452f`, ocra `#d9a441`, salvia `#7d9b74`. Niente rosso/bianco di Babbo Natale, niente viola-blu da template.
- Tipografia: base `17px` sul root (le misure in `rem` scalano insieme); serif `Iowan Old Style / Palatino / Georgia` per titoli, numeri e punteggi; corsivo manoscritto con pila `Segoe Script → Bradley Hand → Bradley Hand ITC → Noteworthy → Snell Roundhand → Chalkboard SE`, quindi **Caveat** (woff2 latin self-hosted in `fonts/`, licenza OFL in `fonts/OFL.txt`, `font-display: swap`, `size-adjust: 106%`) e infine `Comic Sans MS`/`cursive`. Segoe Script è la prima scelta ovunque sia installato (Windows), iOS/macOS usano Bradley Hand, Android — che non ha manoscritti di sistema — usa Caveat: stessa grafia percepita su ogni piattaforma senza rilevamento JS. Sans di sistema per date, avvisi e feedback lunghi. Nessuna CDN: il woff2 è nel precache del service worker e funziona offline.
- Testo su fondo scuro e su carta sempre con contrasto ≥ 4.5:1 per il testo normale; focus visibile (outline ocra 2px, oppure outline tratteggiato terracotta sul campo).

### Home

- Griglia di 24 caselle: 3 colonne su mobile, 4 da 540px, 5 da 700px. Ogni casella è un `<button>` dentro una `<ol>`.
- Ogni casella è un ritaglio di carta: tonalità ciclica per giorno, inclinazione (`--tilt`) e sollevamento (`--lift`) deterministici in `ui.js`, angoli irregolari, grana e ombra bassa.
- `available` mostra "da giocare" in corsivo; `solved` mostra spunta e punti; con indizio lampadina e metà punti; `failed` croce e 0. `locked` è una carta scura con bordo tratteggiato e lucchetto, non cliccabile.
- Oggi: nastro adesivo in alto a sinistra (`door__tape`), "oggi" scritto a mano dentro la carta, bordo terracotta.
- Desktop: su dispositivi con hover (`@media (hover: hover) and (pointer: fine)`) la casella si solleva di 2px e accende un alone ocra (`box-shadow` 32px), con il numero che si scurisce; le caselle chiuse non si accendono, al massimo il bordo si rischiara. Su touch l'effetto non esiste.
- **Casella bonus**: se `questionPoints` supera 10 la casella diventa carta kraft con stella disegnata e valore in evidenza. Con il JSON attuale è il giorno 20.
- Le caselle concluse restano apribili in sola lettura per rivedere domanda, esito e risposta; non sono rigiocabili.
- Testata: dedica manoscritta, titolo serif con sottolineatura a penna, data locale, nota sulle caselle aperte e tag di carta con il punteggio (`N/250`).

### Schermata domanda

- Testo domanda in serif, "Giorno N" e i punti disponibili scritti a mano, contatore "N tentativi rimasti" in corsivo.
- Campo risposta stile quaderno: etichetta visibile "la tua risposta", linea di base al posto del riquadro, placeholder in corsivo, contatore `x/60` allineato a destra. `font-size: 17px` (niente zoom iOS), `enterkeyhint="send"`, invio dal tasto "Vai".
- **Tastiera iOS**: dopo un invio valido (giusto o sbagliato) `ui.js` chiama `input.blur()`. Per gli errori di validazione il focus resta.
- Indizio: pulsante con bordo tratteggiato e scritta a mano, avviso con importo dinamico ("Con l'indizio il massimo scende a X punti"). Usato l'indizio, il pulsante sparisce e l'indizio compare in un box tratteggiato.
- Feedback `role="status" aria-live="polite"` con i messaggi del JSON quando presenti; un errore di input non consuma tentativi.
- A domanda chiusa: form nascosto, esito e punti, "la risposta era" in corsivo con tutte le varianti.
- Coriandoli su canvas a risposta corretta (~2.4s).

### Resoconto

- Punteggio `score / maxScore` in cifre grandi, fascia corrente scritta a mano.
- Albero di Natale SVG disegnato a mano (lati irregolari, contorno tratteggiato) con tre fasce:
  - `0–149` — "Sei na pippa" (salvia)
  - `150–209` — "Ci siamo quasi" (ocra)
  - `210–250` — "Brava scema" (verde scuro, stella in cima)
  Le etichette vivono nell'array `BANDS` di `ui.js` (unica fonte: la legenda in HTML viene riempita da lì). Le fasce raggiunte e quelle sotto sono colorate, la legenda evidenzia quella corrente come un tratto di evidenziatore (`aria-current="true"`).
- Riga di sintesi (corrette / sbagliate / da giocare / ancora chiuse) e riga per giorno con stato e punti. Raggiungibile in ogni momento dalla tag del punteggio.
- Se il massimo non è 250, il denominatore si adegua ma le fasce restano fisse.

### Movimento e accessibilità

- Animazioni: apertura casella (flip breve), ingresso della card, colorazione dell'albero, coriandoli.
- Tutto è disattivato con `prefers-reduced-motion: reduce`: CSS globale sulle transizioni/animazioni e guard esplicito prima del flip e dei coriandoli.
- Target touch ≥ 44px (caselle ≥ 68px, pulsanti 44–54px), `:focus-visible` sempre visibile, `aria-label` descrittivi per ogni casella, skip link, `sr-only` per le label.
- iPhone/Safari: `100dvh`, `env(safe-area-inset-*)`, `viewport-fit=cover`; `visualViewport` + scroll mirato al focus dell'input così la tastiera non copre il campo.
- Se `questions.enc.json` non si carica o la passphrase non viene accettata, la home resta dietro il gate e mostra l'errore senza crash.
- Con `?debugDate` attivo compare un badge "debug · <data>"; `?debugReset=1` azzera lo stato e rimuove il parametro dall'URL con `history.replaceState`.

## 9. PWA e installazione

### Manifest

`manifest.webmanifest` con percorsi **relativi**, così funziona in una sottocartella di GitHub Pages:

```json
{
  "name": "Calendario dell'Avvento",
  "short_name": "Avvento",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#241b1c",
  "theme_color": "#241b1c",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    {
      "src": "./icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

`index.html` collega il manifest (`rel="manifest"`), l'icona `apple-touch-icon` 180×180, le meta iOS (`apple-mobile-web-app-capable`, `apple-mobile-web-app-title=Avvento`, `status-bar-style=black-translucent`, `mobile-web-app-capable`) e `theme-color` allineato a `#241b1c`.

### Icone

Quattro PNG generate con GDI+ (sfondo prugna, albero crema, stella ocra, tronco terracotta, margine del 5%):

- `icons/icon-192.png` — 192×192, usata dal manifest
- `icons/icon-512.png` — 512×512, usata dal manifest
- `icons/icon-512-maskable.png` — 512×512 con il disegno dentro la safe zone (~74%), per Android: evita che il launcher ritagli l'albero o lo incornici con un bordo bianco
- `icons/apple-touch-icon.png` — 180×180, icona iOS (niente trasparenza: iOS applica il suo arrotondamento e uno sfondo trasparente diventa nero); stesso soggetto con margine del 5%

**Come sostituirle**: sovrascrivere i file mantenendo nomi e dimensioni esatte (192×192, 512×512 per `icon-512.png` e `icon-512-maskable.png`, 180×180), con qualsiasi editor grafico o generatore. Per iOS l'icona deve essere quadrata, senza trasparenza e con il soggetto centrato; per la maskable Android il contenuto va tenuto dentro ~80% del lato (quella attuale usa un margine del 13%). Dopo la sostituzione alzare `CACHE_NAME` nel service worker, altrimenti il browser continua a servire l'icona vecchia dalla cache. I percorsi nel manifest e nell'HTML non cambiano.

### Service worker

`service-worker.js`, registrato da `js/pwa.js` con `navigator.serviceWorker.register("./service-worker.js", { scope: "./" })`.

- `CACHE_NAME = "advent-calendar-v10"` (versionata a mano a ogni deploy).
- `install`: precache di shell, CSS, font, tutti i moduli JS, `questions.enc.json`, manifest e icone; poi `skipWaiting()`.
- `activate`: elimina tutte le cache `advent-calendar-*` diverse da quella corrente, poi `clients.claim()`.
- `fetch`, solo same-origin e solo `GET`:
  - navigazioni e `questions.enc.json` → **network-first** con fallback alla cache (e `index.html` per le navigazioni offline);
  - tutto il resto → **cache-first** con aggiornamento della cache alla prima risposta di rete.
- `message { type: "SKIP_WAITING" }` per attivare subito una nuova versione.

**Aggiornare il sito**: modificare i file e alzare `CACHE_NAME` (es. `v10` → `v11`), poi ricaricare due volte (la prima installa il nuovo SW, la seconda serve la nuova cache). I browser limitano il controllo di aggiornamento dello script: se dopo il deploy resta la versione vecchia, forzare con `navigator.serviceWorker.getRegistration().then((r) => r.update())`, svuotare i dati del sito, oppure (su iPhone) rimuovere e riaggiungere l'icona dalla Home. `questions.enc.json` è network-first: rigenerarlo con lo script basta, arriva al primo avvio online anche senza cambiare versione.

### Schermata di installazione

Overlay `#install` in `index.html`, mostrato da `js/pwa.js`:

- visibile **solo** se `display-mode: standalone` è falso e `navigator.standalone` non è `true` (quindi nel browser, non nell'app installata);
- **tre passi generati da `js/pwa.js` in base alla piattaforma** (`detectPlatform`): iOS (Safari → Condividi → Aggiungi alla schermata Home), Android (Chrome/browser predefinito → menu ⋮ → Installa app), desktop (Chrome/Edge → icona di installazione → Installa). Restano identici struttura, stile e copy di contorno: cambiano solo le istruzioni;
- se lo user agent è di un browser interno (WhatsApp, Instagram, Facebook, TikTok, WebView Android, ecc.) mostra l'avviso "apri nel browser giusto" con il menu `⋯`/`⋮` della piattaforma;
- si chiude con "Ho capito", con la X o con il backdrop/Esc; la chiusura è ricordata in `localStorage` (`advent-calendar.install-hint.v1`) e le istruzioni si possono riaprire dal link "come installarla sulla Home" in fondo alla home;
- dialog modale: `role="dialog" aria-modal="true"`, focus iniziale sulla X, app di sfondo `inert` + `aria-hidden`, focus trap con Tab, focus restituito all'elemento che l'ha aperto, scroll della pagina bloccato (`body.install-open`).

### Safe area e iOS

- `viewport-fit=cover` + padding con `env(safe-area-inset-top/bottom)` su `.app`, overlay e card.
- `color-scheme: dark` e `theme-color: #241b1c` coerenti con lo status bar `black-translucent`.
- Input a 17px (nessuno zoom automatico), `enterkeyhint="send"`, scroll mirato con `visualViewport`.

### Deploy su GitHub Pages

- Repository pubblico: `https://github.com/matteo03s/advent-calendar-public`
- URL del sito: `https://matteo03s.github.io/advent-calendar-public/`
- Sorgente: snapshot orfano con storia pulita (nessun commit contiene `questions.json` in chiaro); branch `main` del repo pubblico.
- Pages: Settings → Pages → **Deploy from a branch** → `main` / `(root)`.
- Copia di lavoro per il sito: branch locale `public`, che traccia `public/main`; `origin/main` (repo privato) resta archivio della storia completa. Non pushare `--all`/`--mirror` sul remoto pubblico, altrimenti si porta online anche la storia privata.
- **Aggiornare le domande**: con il branch `public` attivo, modificare `questions.json` locale (ignorato da git), eseguire `node scripts/encrypt-questions.mjs`, committare `questions.enc.json` e pushare. Il file cifrato è network-first: la nuova versione arriva al primo avvio online.
- **Aggiornare codice/CSS/icone**: alzare `CACHE_NAME` in `service-worker.js`, commit e push. Poi doppio reload; su iPhone chiudere le schede o rimuovere/riaggiungere l'icona se resta la versione vecchia.
- **Verifica desktop**: DevTools → Application → Manifest (nome, icone, `standalone`, `start_url`), Service Workers (attivo, prova Offline), Cache Storage (`advent-calendar-v10` con `questions.enc.json`, CSS, JS, icone).
- **Verifica iPhone**: aprire in Safari, inserire la passphrase, controllare lo sblocco; “Aggiungi alla schermata Home”; attivare la modalità aereo e riaprire l'icona. L'app installata può chiedere la passphrase una volta anche se già inserita in Safari (storage separato).
- **Privacy**: il repo è pubblico, quindi `questions.enc.json` è scaricabile, ma è cifrato AES-GCM con una passphrase che non sta nel repo. Base64 o hash non sarebbero una protezione reale. Per un accesso a prova di estraneo servirebbe un hosting con access control (es. Cloudflare Access), non necessario per un regalo di coppia.

## 10. Review: date, fuso orario, accessibilità

Correzioni applicate in questo passaggio:

- **Fuso orario / cambio giorno**: tutta la logica usa la data locale (`getDate`/`getMonth`, `new Date(y, m, d)` per `?debugDate`), mai UTC. Aggiunto `scheduleMidnightRefresh()` in `ui.js`: timer che allo scoccare della mezzanotte locale (00:00:02) ridisegna testata, home e vista corrente, e si riarma; copre l'app lasciata aperta durante il cambio di giorno, che prima si aggiornava solo al `visibilitychange`.
- **`theme-color`**: era rimasto il verde della vecchia palette (`#0d1a17`); allineato a `#241b1c` in meta e manifest.
- **Contatore caratteri**: era `aria-hidden` ma referenziato da `aria-describedby` sull'input, quindi mai annunciato; ora è leggibile e descritto.
- **Overlay**: aggiunti focus trap, `inert`/`aria-hidden` sullo sfondo, ripristino del focus, chiusura con Esc e blocco dello scroll; prima non esisteva alcun modale.
- **Contenuto dell'overlay**: i numeri dei passi sono decorativi (`aria-hidden`), il testo resta comprensibile senza di essi.
- **Timbri di stato**: i giorni chiusi sono `disabled` e hanno `aria-label` descrittivo ("bonus da 20 punti", "corretto con indizio", ecc.), quindi lo stato non è affidato al solo colore.
- **Focus visibile**: outline ocra su tutti gli elementi interattivi, outline tratteggiato sul campo di risposta; nessun `outline: none` senza sostituto.
- **Domande cifrate**: AES-GCM + PBKDF2 310k nel browser, chiave derivata in `localStorage`, gate modale senza chiusura, nessun plaintext nel repo. La passphrase usata per il file demo va sostituita con una scelta dall'utente prima della pubblicazione.
- **Storia git**: il vecchio `questions.json` in chiaro è ancora nei commit precedenti al branch di cifratura; va rimosso con `git filter-repo`/BFG o serve un repo nuovo prima di renderlo pubblico.

Nessun'altra incoerenza di data trovata: `updatedAt` è ISO UTC ma è solo informativo, e il confronto tra giorni usa esclusivamente componenti locali.

## 11. Checklist funzionalità

- [x] `SPEC.md`
- [x] `questions.json` di esempio (locale) + `questions.enc.json` versionato
- [x] Cifratura AES-GCM/PBKDF2, script `scripts/encrypt-questions.mjs`, chiave locale
- [x] Schermata di sblocco `#gate` e caricamento decifrato in `js/questions.js`
- [x] `tests/questions-crypto.test.js` — compatibilità Node ↔ WebCrypto
- [x] `js/config.js` — costanti condivise
- [x] `js/match.js` — normalizzazione e confronto (`contains` / `exact`, limite 60)
- [x] `tests/match.test.js` — accenti, maiuscole, parola dentro parola, input lungo
- [x] `js/state.js` — load/save/sanitize localStorage, punteggio derivato
- [x] `tests/state.test.js`
- [x] `questions.test.js` — involucro cifrato e JSON locale se presente
- [x] `js/game.js` — sblocco giornaliero, tentativi, punteggi, stati, debugDate
- [x] `tests/game.test.js` — punteggi, tentativi, indizio, sblocco per data, giorni recuperati, persistenza
- [x] `js/questions.js` — caricamento cifrato, decifratura e validazione con errori leggibili
- [x] `index.html` + `css/style.css` — griglia 24 giorni con stati bloccato/disponibile/giocato
- [x] Restyling "carta fatta a mano": 4 tonalità di carta, nastro e "oggi" manoscritto, inclinazioni/sollevamenti per casella, campo a riga, albero disegnato
- [x] Domanda bonus del 20 dicembre (`points: 20`, casella dorata, totale 250)
- [x] Vista domanda — input, contatore caratteri, indizio, feedback, 2 tentativi, risposta rivelata
- [x] Tastiera iOS — `blur()` dopo l'invio (verificato: `document.activeElement` non è più l'input)
- [x] Resoconto — punteggio /250, albero a fasce (0–149 / 150–209 / 210–250), riepilogo per giorno
- [x] `js/ui.js` — bootstrap, viste, `?debugDate`, `?debugReset`, salvataggio a ogni azione
- [x] Migrazione stato localStorage v1 → v2 con `maxPoints`
- [x] Accessibilità — target ≥ 44px, `aria-live`, `prefers-reduced-motion`, focus visibile
- [x] Verifica in browser (viewport 390×844): home, domanda, indizio, 10/5/0 punti, resoconto, 30 nov / 24–25 dic, `?debugReset=1`
- [x] PWA — manifest, icone 192/512/180, service worker con cache versionata e offline
- [x] Schermata di installazione (solo browser, non installata) con avviso per browser interni
- [x] Font manoscritto self-hosted (Caveat woff2, OFL): stessa grafia su iOS, Android e desktop
- [x] Guida per piattaforma: iOS, Android e desktop, con icona maskable per Android
- [x] `tests/pwa.test.js` — rilevamento piattaforma e testi delle guide
- [x] Review date/fuso orario (timer di mezzanotte) e accessibilità (dialog modale, focus, contatore)
- [x] Deploy su GitHub Pages — `https://matteo03s.github.io/advent-calendar-public/`
- [x] Repo pubblico da snapshot orfano, senza `questions.json` nella storia
- [ ] Test su iPhone reale (Safari + aggiunta a Home)
