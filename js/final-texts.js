// Testi modificabili dell'album finale e dell'immagine salvata.
// Cambia qui le scritte: il resto del codice le legge da questo file.
export const ALBUM_TEXT = {
  hand: "24 giorni insieme",
  title: "Il nostro calendario",
  dateSuffix: "24 giorni",
  foot: "Fatto per te, un giorno alla volta.",

  save: "Salva come immagine",
  saving: "Preparo l'immagine…",
  saveHint:
    "Su iPhone si apre il menu Condividi: scegli “Salva immagine”. In alternativa tieni premuto sull'anteprima.",
  previewTitle: "La tua immagine",
  previewIntro: "Tieni premuto sull'immagine e scegli “Salva immagine”.",
  share: "Condividi",
  download: "Scarica",
  fileName: "calendario-avvento.png",
  shareTitle: "Il nostro calendario",
  maxChipSuffix: "punti",
  previewAlt: "Riepilogo illustrato del calendario",

  // Prefissi usati sia nella lista dell'album sia nell'immagine.
  answerPrefix: "tu: ",
  emptyAnswer: "tu: —",
  correctPrefix: "era: ",

  statuses: {
    solved: "corretto",
    hint: "con indizio",
    failed: "sbagliato",
    unplayed: "non giocata",
    playing: "in sospeso",
  },

  image: {
    hand: "24 giorni insieme",
    title: "Calendario dell'Avvento",
    scoreLabel: "punteggio",
    foot: "Fatto per te, un giorno alla volta.",
  },
};

// Messaggi finali in base al punteggio: minRatio è la quota del massimo (0–1).
// I testi sono segnaposto: sostituiscili con i tuoi.
export const FINAL_MESSAGES = [
  {
    minRatio: 0.85,
    text: "Bravissima, vedo che hai studiato!",
  },
  {
    minRatio: 0.65,
    text: "Sei stata brava, ma potevi fare di più",
  },
  {
    minRatio: 0.35,
    text: "Mazza, non c'hai manco provato",
  },
  {
    minRatio: 0,
    text: "Forse dovremo rivalutare sta relazione eh",
  },
];
