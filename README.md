# advent-calendar

Calendario dell'avvento con una domanda al giorno (1–24 dicembre), HTML/CSS/JS vanilla, PWA per iPhone. Nessun backend, nessuna dipendenza.

- Specifica e decisioni: [SPEC.md](./SPEC.md) (fonte di verità)
- Domande: `questions.json` in chiaro resta locale (ignorato da git); nel repo c'è `questions.enc.json` cifrato
- Stato salvato: `localStorage`, chiave `advent-calendar.state.v1` (schema `version: 2`)

Punteggio: ogni domanda vale `points` (default 10); con l'indizio il valore si dimezza. Il giorno 20 del JSON di esempio vale 20, quindi il massimo è **250**. Il resoconto mostra un albero a tre fasce: 0–149, 150–209, 210–250.

## Avvio in locale

Serve un server statico: da `file://` i moduli ES e `fetch("questions.enc.json")` non funzionano.

```sh
python -m http.server 4173
# oppure: npx serve .
```

Poi apri <http://127.0.0.1:4173>.

## Test manuale con una data finta

Aggiungi `?debugDate=YYYY-MM-DD` all'URL: la data vale per lo sblocco delle caselle e per i timestamp salvati, così puoi provare tutto senza aspettare dicembre.

| URL | Cosa verifica |
|---|---|
| `?debugDate=2026-11-30` | nessuna casella aperta, messaggio "si apre il 1° dicembre" |
| `?debugDate=2026-12-01` | solo la casella 1 cliccabile, badge "oggi" |
| `?debugDate=2026-12-05` | caselle 1–5 aperte, 6–24 chiuse |
| `?debugDate=2026-12-24` | tutte e 24 aperte, giorno 24 evidenziato |
| `?debugDate=2026-12-31` | tutte aperte, nessun badge "oggi" |

`?debugReset=1` azzera lo stato salvato (il parametro viene rimosso dall'URL dopo il reset, così un refresh non cancella di nuovo tutto). I parametri si combinano: `?debugDate=2026-12-05&debugReset=1`.

Flusso consigliato:

1. `?debugDate=2026-12-05&debugReset=1`, apri il giorno 1: risposta giusta al primo colpo → 10 punti e coriandoli.
2. Giorno 2: sbaglia una volta, poi indizio, poi risposta giusta → 5 punti.
3. Giorno 3: sbaglia due volte → 0 punti, form sparisce e compare la risposta corretta.
4. Ricarica: gli esiti restano (localStorage), la tag in alto apre il resoconto con l'albero e il riepilogo.
5. `?debugDate=2026-12-24`: recupera un giorno passato (es. 4) → deve valere 10 punti.

## Domande cifrate

Le domande in chiaro stanno solo in locale (`questions.json`, ignorato da git). Nel repository c'è `questions.enc.json`, cifrato con AES-256-GCM e chiave derivata dalla passphrase (PBKDF2-SHA256, 310.000 iterazioni).

Per aggiornare le domande, modifica `questions.json` e rigenera il file cifrato:

```powershell
node scripts/encrypt-questions.mjs
```

Lo script chiede la passphrase a terminale (non la mostra mentre la digiti). In alternativa, per uso non interattivo: `$env:ADVENT_PASSPHRASE = "..."` prima del comando.

La passphrase non entra mai nel repo: all'apertura l'app la chiede una volta, salva la chiave derivata solo su quel dispositivo e poi funziona offline. Il file attuale è ancora cifrato con la passphrase demo usata durante lo sviluppo: **rigeneralo con la tua prima di pubblicare**.

Attenzione alla storia git: `questions.json` è già nei commit precedenti (dati di esempio). Prima di rendere pubblico il repo va rimosso dalla storia con `git filter-repo`/BFG o serve un repository nuovo; cancellarlo in un commit successivo non basta.

## Prima apertura

Al primo accesso si susseguono tre manifesti, una volta sola:

1. la **passphrase** che sblocca le domande;
2. la guida per **aggiungere l'app alla Home** (solo nel browser);
3. **“Come funziona”**: una casella al giorno, due tentativi, indizio che dimezza il punteggio, bonus del 20 dicembre, recupero dei giorni saltati, album dal 24 dicembre.

Il link “come funziona” in fondo alla home riapre la spiegazione.

## Album finale

Dal **24 dicembre** compare sotto il calendario la card “Il nostro album”: riepilogo di tutte le domande con la tua risposta, l'esito, i punti e il totale, più un messaggio finale che cambia in base al punteggio. Tutte le scritte modificabili — messaggi finali, titoli, stati, pulsanti, prefissi e nome del file — stanno in **`js/final-texts.js`** (`FINAL_MESSAGES` e `ALBUM_TEXT`): modifica solo quel file.

Il pulsante **“Salva come immagine”** genera un PNG del riepilogo con il canvas nativo (nessuna libreria esterna): su iPhone apre il menu Condividi, da cui “Salva immagine”; se la condivisione non è disponibile mostra l'anteprima, da tenere premuta per salvarla. L'immagine include un piccolo albero di Natale che si colora in base al punteggio. Il file resta tuo anche se il sito un giorno non fosse più online.

## Installazione (iPhone e Android)

L'app è la stessa; cambia solo il percorso di installazione, che la schermata di benvenuto mostra in base al dispositivo.

**iPhone (Safari)**
1. Apri l'indirizzo in Safari.
2. Tocca **Condividi** e scegli **Aggiungi alla schermata Home**.
3. Si apre a tutto schermo e funziona anche offline.

**Android (Chrome o browser predefinito)**
1. Apri l'indirizzo nel browser.
2. Tocca il **menu ⋮** in alto a destra.
3. Scegli **Installa app** (o "Aggiungi alla schermata Home").

Se il link arriva da WhatsApp o Instagram, la schermata avvisa di riaprirlo in Safari/Chrome. Le istruzioni si possono riaprire dal link "come installarla sulla Home" in fondo alla home.

## Aggiornare il sito (service worker)

Le domande cifrate e `js/final-texts.js` sono network-first: per cambiare domande o scritte dell'album basta rigenerare/pushare, arrivano al primo avvio online. Per il resto del codice, CSS e icone invece bypassa la cache:

1. alza `CACHE_NAME` in `service-worker.js` (es. `advent-calendar-v16` → `v17`);
2. ricarica due volte (la prima installa il nuovo SW, la seconda serve la cache nuova);
3. se resta la versione vecchia, forza il controllo con `navigator.serviceWorker.getRegistration().then((r) => r.update())`, cancella i dati del sito da Safari (Impostazioni → Safari → Cancella dati e siti web) oppure rimuovi e riaggiungi l'icona dalla Home.

Il service worker richiede `https://` o `localhost`: su GitHub Pages funziona, da `file://` no.

## Font

La scrittura a mano usa prima **Segoe Script** dove è installato (Windows), poi `Bradley Hand` su iOS/macOS e infine **Caveat** per chi non ha manoscritti di sistema (Android), incluso in `fonts/caveat-latin.woff2` (self-hosted, nessuna CDN, licenza SIL OFL 1.1 in `fonts/OFL.txt`). Se sostituisci il woff2, alza `CACHE_NAME` nel service worker.

## Test

```sh
npm test
```

I test coprono confronto risposte, storage, regole di gioco (incluso lo sblocco dell'album), involucro cifrato, compatibilità Node ↔ WebCrypto e guida di installazione.
