# btsmap

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
- Impostare `UPLOADS_DIR` per specificare la cartella in cui salvare le immagini (di default `/opt/media`).
- Impostare `ENABLE_MAP_CACHE=true` per abilitare il download periodico dell'estratto OSM dell'Italia; la funzione è disabilitata di default.
- Impostare `DB_DIR` per specificare una cartella esterna in cui salvare il database SQLite (di default `/opt/database`).

## Database standalone

Per eseguire il database come processo indipendente, utile per mantenerlo attivo durante gli aggiornamenti del frontend o del backend, è disponibile lo script:

```bash
npm run db
```

Il database verrà creato nella cartella indicata da `DB_DIR` o, in mancanza, in `/opt/database`.

## Struttura del progetto

- `backend/` – API e server Express con SQLite.
- `frontend/` – interfaccia utente basata su Leaflet.
- `deploy/` – materiali e configurazioni per il deployment.

## Importazione da file AGCOM

Per importare marker da un file Excel scaricato dal sito AGCOM è disponibile lo script:

```bash
cd backend
 npm run import-agcom -- path/to/file.xlsx
```

 Lo script converte automaticamente le coordinate "LAT." e "LONG." in gradi decimali, salva l'"Ubicazione" nel campo `localita`, il "Bouquet" nella `descrizione` e la "FREQ. CENTRALE/PORTANTE" nel campo `frequenze`, assegnando il tag `Radio` per i tipi *FM* e *RD* oppure `TV` per i tipi *TD*. Se più righe presentano la stessa latitudine, longitudine e ubicazione, i relativi dettagli vengono uniti in un unico marker.

## Funzionalità Admin

Gli utenti con ruolo *admin* possono attivare la **Modalità unione** dalla pagina principale e selezionare più marker vicini. I marker scelti vengono fusi in uno solo, combinando descrizioni, tag, frequenze e immagini dei marker originali.

## Unione automatica di marker vicini

Per accorpare tutti i marker entro una distanza specifica è disponibile lo script:

```bash
cd backend
npm run merge-nearby -- <distanza-in-metri>
```

Al termine dell'esecuzione verrà mostrato il numero totale di marker uniti.
