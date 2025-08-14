const xlsx = require('xlsx');
const proj4 = require('proj4');
const db = require('../db');
const { findNearbyMarker } = require('./utils');

const SOURCE = 'ARIA Veneto';

// Gauss-Boaga (EPSG:3003) projection used by the dataset
const gaussBoaga =
  '+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 +ellps=intl ' +
  '+towgs84=-104.1,-49.1,-9.9,-0.971,-2.917,-0.714,-11.68 +units=m +no_defs';

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

function parseFloatSafe(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const v = parseFloat(value.replace(',', '.'));
    return isNaN(v) ? null : v;
  }
  return null;
}

function convertCoords(x, y) {
  const xNum = parseFloatSafe(x);
  const yNum = parseFloatSafe(y);
  if (xNum == null || yNum == null) return { lat: null, lng: null };
  if (Math.abs(xNum) <= 180 && Math.abs(yNum) <= 90) {
    return { lat: yNum, lng: xNum };
  }
  try {
    const [lng, lat] = proj4(gaussBoaga, proj4.WGS84, [xNum, yNum]);
    return { lat, lng };
  } catch {
    return { lat: null, lng: null };
  }
}

const lte5gOperators = new Set(
  [
    'Telecom Italia S.p.A.',
    'Vodafone Italia S.p.A.',
    'Wind Tre S.p.A.',
    'Zefiro Net S.r.l.',
    'Iliad Italia S.p.A.',
  ].map((s) => s.toLowerCase())
);

const wispOperators = new Set(
  [
    'INFRACOM IT S.p.A.',
    'Net Global S.r.l.',
    'NETDISH S.p.A.',
    'TRIVENET S.p.A.',
  ].map((s) => s.toLowerCase())
);

function mapTags(gestore) {
  if (!gestore) return null;
  const g = gestore.trim().toLowerCase();
  if (lte5gOperators.has(g)) return ['LTE/5G'];
  if (g === 'american forces network south') return ['TV'];
  if (wispOperators.has(g)) return ['WISP'];
  if (g.includes('opnet')) return ['Opnet'];
  if (g === 'rete ferroviaria italiana s.p.a.') return ['Sconosciuto'];
  return null;
}

async function main() {
  const filePath = process.argv[2];
  const radiusMeters = parseFloat(process.argv[3]) || 10;
  if (!filePath) {
    console.error('Usage: node scripts/import-aria-veneto.js <file> [radiusMeters=10]');
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  const userId = await getOrCreateUserId(SOURCE);

  for (const row of rows) {
    const { lat, lng } = convertCoords(row['coord_x'], row['coord_y']);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }

    const existing = await findNearbyMarker(lat, lng, radiusMeters);
    if (existing) continue;

    const gestore = row['gestore'] || null;
    const tags = mapTags(gestore);
    if (!tags) continue;

    const parts = [];
    if (row['nome']) parts.push(row['nome']);
    if (gestore) parts.push(gestore);
    const descrizione = parts.join(' - ') || null;
    const nome = row['nome'] || gestore || null;
    const tagsStr = tags.length ? JSON.stringify(tags) : null;

    try {
      const result = await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, autore, tag, localita, frequenze) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione, nome, SOURCE, tagsStr, null, null]
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

