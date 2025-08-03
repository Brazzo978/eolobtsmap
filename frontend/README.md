# Frontend

Contiene il codice per l'interfaccia utente dell'applicazione.

La pagina `index.html` utilizza [Leaflet](https://leafletjs.com/) con le tile di OpenStreetMap per la mappa standard e le immagini satellitari di Esri per la vista satellite. Un pulsante consente di passare da una vista all'altra. Ogni marker visualizza un pop-up con nome, descrizione e immagini associate.

Per testare l'interfaccia:
1. avviare il server nella cartella `backend` (`npm start`);
2. aprire `frontend/index.html` in un browser.
