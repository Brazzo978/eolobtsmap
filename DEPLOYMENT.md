# Guida al Deployment

Questa guida descrive come avviare l'intera applicazione (database, backend e frontend) sia in locale sia tramite Docker Compose.

## Requisiti

- [Node.js](https://nodejs.org/) 18 o superiore
- [npm](https://www.npmjs.com/)
- [Docker](https://www.docker.com/) e [docker-compose](https://docs.docker.com/compose/) per il deployment containerizzato

## Deployment locale

1. Clonare il repository e installare le dipendenze del backend:
   ```bash
   cd backend
   npm install
   npm start
   ```
   Il server Express partirà sulla porta `3000` e inizializzerà automaticamente un database SQLite `database.sqlite`. È possibile definire la variabile d'ambiente `JWT_SECRET` prima di avviare il server per firmare i token.

2. Il backend serve automaticamente i file statici della cartella `frontend`. Aprire un browser su [http://localhost:3000](http://localhost:3000) per utilizzare l'interfaccia. In alternativa è possibile aprire direttamente `frontend/index.html`.

## Deployment con Docker Compose

1. Posizionarsi nella cartella `deploy` ed eseguire:
   ```bash
   docker-compose up -d
   ```
   Il file `docker-compose.yml` definisce tre servizi principali:
   - **web**: container Node.js che esegue `npm start` sulla porta `3000`.
   - **db**: container PostgreSQL con database `app`, utente `user` e password `password`.
   - **proxy**: container Nginx che espone il backend sulla porta `80`.

2. Per montare il codice del backend nel container `web` aggiungere nel `docker-compose.yml` una sezione `volumes` e la directory di lavoro:
   ```yaml
   web:
     volumes:
       - ../backend:/app
     working_dir: /app
   ```

3. Gestire i container con i comandi:
   ```bash
   docker-compose logs -f   # mostra i log
   docker-compose down      # arresta e rimuove i container
   ```

