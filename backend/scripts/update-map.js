const https = require('https');
const fs = require('fs');
const path = require('path');

const MAP_URL = 'https://download.geofabrik.de/europe/italy-latest.osm.pbf';
const DATA_DIR = path.join(__dirname, '..', 'map-data');
const FILE_PATH = path.join(DATA_DIR, 'italy-latest.osm.pbf');

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

function downloadFile(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  https.get(url, response => {
    if (response.statusCode !== 200) {
      file.close(() => {
        fs.rm(dest, { force: true }, () => cb(new Error(`Server responded with ${response.statusCode}`)));
      });
      return;
    }
    response.pipe(file);
    file.on('finish', () => file.close(cb));
  }).on('error', err => {
    file.close(() => {
      fs.rm(dest, { force: true }, () => cb(err));
    });
  });
}

function checkAndDownload() {
  https.request(MAP_URL, { method: 'HEAD' }, res => {
    if (res.statusCode !== 200) {
      console.error(`HEAD request failed: ${res.statusCode}`);
      return;
    }
    const remoteTime = new Date(res.headers['last-modified']);
    let needDownload = true;
    if (fs.existsSync(FILE_PATH)) {
      const stats = fs.statSync(FILE_PATH);
      const localTime = stats.mtime;
      needDownload = remoteTime > localTime;
    }
    if (needDownload) {
      console.log('Downloading latest Italy map...');
      downloadFile(MAP_URL, FILE_PATH, err => {
        if (err) {
          console.error('Download failed:', err.message);
        } else {
          console.log('Map updated successfully.');
        }
      });
    } else {
      console.log('Map already up to date.');
    }
  }).on('error', err => {
    console.error('HEAD request error:', err.message);
  }).end();
}

checkAndDownload();

// Check once per day
const DAY = 24 * 60 * 60 * 1000;
setInterval(checkAndDownload, DAY);
