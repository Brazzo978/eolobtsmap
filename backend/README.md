# Backend

Cartella dedicata allo sviluppo del server e dell'API dell'applicazione.
Note iniziali: definire la struttura del progetto e la logica di business.

## Struttura del database

Il database SQLite inizializza automaticamente le seguenti tabelle:

- **users**: credenziali e ruoli degli utenti.
- **markers**: punti sulla mappa con latitudine, longitudine, nome,
  descrizione, autore e timestamp di creazione. È presente un indice su
  `lat` e `lng` per facilitare le ricerche geospaziali.
- **marker_images**: immagini associate ai marker con URL e didascalia,
  collegate tramite chiave esterna a `markers`.

## Aggiornamento automatico della mappa OSM

Lo script `npm run update-map` scarica l'estratto OpenStreetMap dell'Italia e lo salva nella cartella `map-data/`. Il processo verifica quotidianamente la disponibilità di nuove versioni e sostituisce automaticamente il file se necessario.
