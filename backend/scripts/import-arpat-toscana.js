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

function mapTags(tipologia, gestore) {
  const t = (tipologia || '').trim().toLowerCase();
  const g = (gestore || '').trim().toLowerCase();
  if (t === 'telefonia mobile') {
    return ['LTE/5G'];
  }
  if (t === 'radio - tv') {
    return null; // ignore entry
  }
  if (t === 'altro') {
    return ['Sconosciuto', 'WISP'];
  }
  if (t === '-') {
    if (g.includes('eolo')) return ['EOLO'];
    if (g.includes('open fiber')) return ['Openfiber'];
    if (g.includes('opnet')) return ['Opnet'];
    return ['Sconosciuto'];
  }
  // default
  return ['Sconosciuto'];
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-arpat-toscana.js <file.xlsx>');
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  for (const row of rows) {
    const lat = parseFloatSafe(row['Nord']);
    const lng = parseFloatSafe(row['Est']);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }

    const localita = row['Indirizzo'] || null;
    const frequenze = row['Tecnologia'] || null;
    const nome = row['Nome'] || localita;
    const gestore = row['Gestore'] || null;

    const tags = mapTags(row['Tipologia'], gestore);
    if (!tags) continue; // skip entry when null returned

    const descrizione = gestore || null;
    const tagsStr = tags.length ? JSON.stringify(tags) : null;

    try {
      await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, tag, localita, frequenze) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione, nome, tagsStr, localita, frequenze]
      );
    } catch (err) {
      console.error('DB insert failed:', err.message);
    }
  }

  db.close();
}

main();
