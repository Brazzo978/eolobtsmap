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

Per motivi di performance il caching dell'estratto OpenStreetMap è disattivato di default. È possibile attivarlo impostando la variabile d'ambiente `ENABLE_MAP_CACHE=true` prima di avviare il server: in tal caso lo script `scripts/update-map.js` scarica l'estratto dell'Italia nella cartella `map-data/` e ne verifica quotidianamente eventuali aggiornamenti.

## Configurazione del database

- Impostare la variabile d'ambiente `DB_DIR` per utilizzare una cartella esterna dove salvare il file `data.sqlite`.
- È possibile avviare il database come processo separato con `npm run db` nella cartella `backend`.
