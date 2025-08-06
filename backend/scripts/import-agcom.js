const xlsx = require('xlsx');
const db = require('../db');

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
    db.run(sql, params, err => {
      if (err) reject(err); else resolve();
    });
  });
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-agcom.js <file.xlsx>');
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  for (const row of rows) {
    const lat = parseCoord(row['LAT.']);
    const lng = parseCoord(row['LONG.']);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }

    const localita = row['UBICAZIONE'] || null;
    const descrizione = row['BOUQUET'] || null;
    const tag = mapTipo(row['TIPO']);
    const tags = tag ? JSON.stringify([tag]) : null;

    try {
      await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, tag, localita) VALUES (?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione, descrizione, tags, localita]
      );
    } catch (err) {
      console.error('DB insert failed:', err.message);
    }
  }

  db.close();
}

main();
