const xlsx = require('xlsx');
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

const lte5gOperators = new Set([
  'Telecom Italia S.p.A.',
  'Vodafone Italia S.p.A.',
  'Wind Tre S.p.A.',
  'Zefiro Net S.r.l.',
  'Iliad Italia S.p.A.'
]);

const wispOperators = new Set([
  'INFRACOM IT S.p.A.',
  'Net Global S.r.l.',
  'NETDISH S.p.A.',
  'TRIVENET S.p.A.'
]);

function mapTags(gestore) {
  if (!gestore) return null;
  if (lte5gOperators.has(gestore)) return ['LTE/5G'];
  if (gestore === 'American Forces Network South') return ['TV'];
  if (wispOperators.has(gestore)) return ['WISP'];
  if (gestore === 'Rete Ferroviaria Italiana S.p.A.') return ['Sconosciuto'];
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
    const lat = parseFloatSafe(row['coord_y']);
    const lng = parseFloatSafe(row['coord_x']);
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

