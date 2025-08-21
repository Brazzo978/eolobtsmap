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

## Configurazione del database

- Impostare la variabile d'ambiente `DB_DIR` per utilizzare una cartella esterna dove salvare il file `data.sqlite` (di default `/opt/database`).
- È possibile avviare il database come processo separato con `npm run db` nella cartella `backend`.
