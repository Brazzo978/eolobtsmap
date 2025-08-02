# eolobtsmap

Applicazione web che consente agli utenti di segnalare la posizione di una BTS tramite una mappa interattiva.

## Requisiti

- [Node.js](https://nodejs.org/) (versione 18 o successiva) e npm
- Un browser moderno per l'interfaccia utente

## Installazione

1. Clonare il repository:
   ```bash
   git clone <URL_DEL_REPOSITORY>
   cd eolobtsmap
   ```
2. Installare le dipendenze del backend:
   ```bash
   cd backend
   npm install
   ```

## Primo avvio

1. Avviare il server backend:
   ```bash
   npm start
   ```
   Il server sarà raggiungibile su `http://localhost:3000`.
2. Aprire `frontend/index.html` in un browser per utilizzare l'applicazione.

## Personalizzazioni

- Per cambiare la porta del server è possibile usare la variabile d'ambiente `PORT`.
- Se si dispone di un bucket S3, impostare le variabili `S3_BUCKET`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` per salvare le immagini nel cloud; in caso contrario verranno salvate localmente nella cartella `backend/uploads`.

## Struttura del progetto

- `backend/` – API e server Express con SQLite.
- `frontend/` – interfaccia utente basata su Leaflet.
- `deploy/` – materiali e configurazioni per il deployment.
