// Costanti condivise da gioco, storage e validazione del calendario.

// Giorni del calendario.
export const FIRST_DAY = 1;
export const LAST_DAY = 24;

// Regole di gioco.
export const MAX_ATTEMPTS = 2;
export const DEFAULT_POINTS = 10;
export const MAX_ANSWER_LENGTH = 60;

// Stato persistente: il nome della chiave resta ".v1" per non perdere i salvataggi,
// mentre STATE_VERSION è la versione dello schema interno (con migrazione).
export const STORAGE_KEY = "advent-calendar.state.v1";
export const STATE_VERSION = 2;
