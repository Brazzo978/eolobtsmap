const xlsx = require('xlsx');
const proj4 = require('proj4');
const db = require('../db');

function runAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, err => {
      if (err) reject(err); else resolve();
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
    const [lng, lat] = proj4('EPSG:32632', proj4.WGS84, [xNum, yNum]);
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
  if (g === 'rete ferroviaria italiana s.p.a.') return ['Sconosciuto'];
  return null;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-aria-veneto.js <file>');
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  for (const row of rows) {
    const { lat, lng } = convertCoords(row['coord_x'], row['coord_y']);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }

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
      await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, tag, localita, frequenze) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione, nome, tagsStr, null, null]
      );
    } catch (err) {
      console.error('DB insert failed:', err.message);
    }
  }

  db.close();
}

main();

