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

// Gauss-Boaga (EPSG:3003) to WGS84
const gaussBoaga =
  '+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 +ellps=intl ' +
  '+towgs84=-104.1,-49.1,-9.9,-0.971,-2.917,-0.714,-11.68 +units=m +no_defs';

function convertCoords(est, nord) {
  try {
    const [lng, lat] = proj4(gaussBoaga, proj4.WGS84, [est, nord]);
    return { lat, lng };
  } catch (e) {
    return { lat: null, lng: null };
  }
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
    const nord = parseFloatSafe(row['Nord']);
    const est = parseFloatSafe(row['Est']);
    if (nord == null || est == null) {
      console.warn('Skipping row due to invalid coordinates');
      continue;
    }

    const { lat, lng } = convertCoords(est, nord);
    if (lat == null || lng == null) {
      console.warn('Skipping row due to failed coordinate conversion');
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
