const xlsx = require('xlsx');
const db = require('../db');
const { findNearbyMarker } = require('./utils');

const SOURCE = 'AGCOM';

function parseCoord(coord) {
  if (!coord || typeof coord !== 'string') return null;
  const m = coord.match(/^(\d+)([NSEW])(\d{2})(\d{2})$/i);
  if (!m) return null;
  const deg = parseInt(m[1], 10);
  const min = parseInt(m[3], 10);
  const sec = parseInt(m[4], 10);
  const sign = /[SW]/i.test(m[2]) ? -1 : 1;
  return sign * (deg + min / 60 + sec / 3600);
}

function mapTipo(t) {
  if (!t) return null;
  t = t.trim().toUpperCase();
  if (t.startsWith('FM') || t.startsWith('RD')) return 'Radio';
  if (t.startsWith('TD')) return 'TV';
  return null;
}

function runAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID });
    });
  });
}

function getOrCreateUserId(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row.id);
      db.run(
        'INSERT INTO users (username, role) VALUES (?, ?)',
        [username, 'user'],
        function (err2) {
          if (err2) return reject(err2);
          resolve(this.lastID);
        }
      );
    });
  });
}

async function main() {
  const filePath = process.argv[2];
  const radiusMeters = parseFloat(process.argv[3]) || 10;
  if (!filePath) {
    console.error('Usage: node scripts/import-agcom.js <file.xlsx> [radiusMeters=10]');
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  // Group rows by same lat, lng and localita
  const markers = new Map();

  const userId = await getOrCreateUserId(SOURCE);

  for (const row of rows) {
    const lat = parseCoord(row['LAT.']);
    const lng = parseCoord(row['LONG.']);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }

    const localita = row['UBICAZIONE'] || null;
    const key = `${lat}:${lng}:${localita || ''}`;
    if (!markers.has(key)) {
      markers.set(key, {
        lat,
        lng,
        localita,
        descrizioni: new Set(),
        frequenze: new Set(),
        tags: new Set()
      });
    }

    const marker = markers.get(key);
    if (row['BOUQUET']) marker.descrizioni.add(row['BOUQUET']);
    if (row['FREQ. CENTRALE/PORTANTE']) marker.frequenze.add(row['FREQ. CENTRALE/PORTANTE']);
    const tag = mapTipo(row['TIPO']);
    if (tag) marker.tags.add(tag);
  }

  for (const marker of markers.values()) {
    const existing = await findNearbyMarker(marker.lat, marker.lng, radiusMeters);
    if (existing) continue;
    const descrizione = Array.from(marker.descrizioni).join(' | ');
    const frequenze = Array.from(marker.frequenze).join(', ');
    const tags = marker.tags.size ? JSON.stringify(Array.from(marker.tags)) : null;
    const nome = marker.localita || descrizione;

    try {
      const result = await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, autore, tag, localita, frequenze) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          marker.lat,
          marker.lng,
          descrizione,
          nome,
          SOURCE,
          tags,
          marker.localita,
          frequenze,
        ]
      );
      await runAsync(
        'INSERT INTO audit_logs (user_id, action, marker_id) VALUES (?, ?, ?)',
        [userId, 'create', result.lastID]
      );
    } catch (err) {
      console.error('DB insert failed:', err.message);
    }
  }

  db.close();
}

main();
