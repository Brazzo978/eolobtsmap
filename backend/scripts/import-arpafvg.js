const fs = require('fs');
const parse = require('csv-parse/sync');
const proj4 = require('proj4');
const db = require('../db');
const { mergeNearby } = require('./merge-nearby');

const SOURCE = 'ARPA FVG';

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
  const v = parseFloat(String(value).replace(',', '.'));
  return Number.isNaN(v) ? null : v;
}

// ETRS89 / UTM zone 33N (EPSG:25833)
const etrs89 = '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs';

function convertCoords(x, y) {
  try {
    const [lng, lat] = proj4(etrs89, proj4.WGS84, [x, y]);
    return { lat, lng };
  } catch (e) {
    return { lat: null, lng: null };
  }
}

function mapGestore(gestore) {
  const g = (gestore || '').trim().toUpperCase();
  if (g === 'RFI') return { tags: ['Sconosciuto'], descrizione: 'Rete ferroviaria' };
  if (g === 'OPNET') return { tags: ['Opnet'], descrizione: 'Opnet' };
  if (g === 'FASTWEB AIR') return { tags: ['WISP'], descrizione: 'Fastweb Air' };
  if (g === '3LETTRONICA INDUSTRIALE') return null; // skip
  return { tags: ['Sconosciuto'], descrizione: gestore || null };
}

async function main() {
  const filePath = process.argv[2];
  const radiusMeters = parseFloat(process.argv[3]) || 10;
  if (!filePath) {
    console.error('Usage: node scripts/import-arpafvg.js <file.csv> [radiusMeters=10]');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse.parse(content, {
    columns: true,
    skip_empty_lines: true,
  });

  const userId = await getOrCreateUserId(SOURCE);

  for (const row of records) {
    const mapping = mapGestore(row['Gestore']);
    if (!mapping) continue; // skip entry

    const x = parseFloatSafe(row['Coord. X (ETRS89)']);
    const y = parseFloatSafe(row['Coord. Y (ETRS89)']);
    if (x == null || y == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }
    const { lat, lng } = convertCoords(x, y);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to failed coordinate conversion');
      continue;
    }

    const nome = row['ID Sito'] || row['Codice Sito'] || row['feature_id'] || `${lat},${lng}`;
    const localita = row['Comune'] || null;

    let descrizione = mapping.descrizione;
    const info = [];
    if (row['Data Attivazione']) info.push(`Data attivazione: ${row['Data Attivazione']}`);
    if (row['Quota s.l.m. (ETRS89)']) info.push(`Quota: ${row['Quota s.l.m. (ETRS89)']} m`);
    if (info.length) {
      descrizione = descrizione ? `${descrizione} | ${info.join(' | ')}` : info.join(' | ');
    }

    const tags = mapping.tags;
    const tagDetails = {};
    tags.forEach((t) => {
      tagDetails[t] = { descrizione, frequenze: null };
    });
    const tagsStr = tags.length ? JSON.stringify(tags) : null;
    const tagDetailsStr = JSON.stringify(tagDetails);

    try {
      const result = await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, autore, tag, localita, frequenze, tag_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione, nome, SOURCE, tagsStr, localita, null, tagDetailsStr]
      );
      await runAsync(
        'INSERT INTO audit_logs (user_id, action, marker_id) VALUES (?, ?, ?)',
        [userId, 'create', result.lastID]
      );
    } catch (err) {
      console.error('DB insert failed:', err.message);
    }
  }

  await mergeNearby(radiusMeters);
  db.close();
}

main();
