const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../db');
const { findNearbyMarker } = require('./utils');

const SOURCE = 'https://lteitaly.it';

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

function getProviderFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  switch (base) {
    case 'tim':
      return 'TIM';
    case 'vodafone':
      return 'Vodafone';
    case 'wind3':
      return 'Wind3';
    case 'iliad':
      return 'Iliad';
    default:
      return base.toUpperCase();
  }
}

async function main() {
  const filePath = process.argv[2];
  const roundMeters = parseFloat(process.argv[3]) || 10; // default 10 m
  const radiusMeters = parseFloat(process.argv[4]) || roundMeters;
  if (!filePath) {
    console.error(
      'Usage: node scripts/import-lteitaly.js <file.ntm> [roundMeters=10] [radiusMeters]'
    );
    process.exit(1);
  }

  const provider = getProviderFromFilename(filePath);
  const userId = await getOrCreateUserId(SOURCE);

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const seen = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const parts = line.split(';');
    if (parts.length < 10) continue;

    const key = parts[5];
    if (!key || seen.has(key)) continue;

    let lat = parseFloat(parts[7]);
    let lng = parseFloat(parts[8]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const latDeg = roundMeters / 111320; // approx meters per degree latitude
    lat = Math.round(lat / latDeg) * latDeg;
    const latRad = (lat * Math.PI) / 180;
    const lngDeg = roundMeters / (111320 * Math.cos(latRad));
    lng = Math.round(lng / lngDeg) * lngDeg;
    lat = Number(lat.toFixed(6));
    lng = Number(lng.toFixed(6));
    seen.add(key);

    const tokens = parts[9].trim().split(/\s+/);
    const siteName = tokens.slice(3).join(' ');

    const existing = await findNearbyMarker(lat, lng, radiusMeters);

    if (existing) {
      const [basePart, provPart] = (existing.descrizione || '').split(' | Provider:');
      const providers = provPart
        ? provPart.split(',').map((p) => p.trim()).filter(Boolean)
        : [];
      if (providers.includes(provider)) continue;
      const base = basePart && basePart.trim() ? basePart.trim() : siteName;
      providers.push(provider);
      const newDescrizione = `${base} | Provider:${providers.join(',')}`;
      try {
        await runAsync('UPDATE markers SET descrizione = ? WHERE id = ?', [
          newDescrizione,
          existing.id,
        ]);
        await runAsync(
          'INSERT INTO audit_logs (user_id, action, marker_id) VALUES (?, ?, ?)',
          [userId, 'update', existing.id]
        );
      } catch (err) {
        console.error('DB update failed:', err.message);
      }
      continue;
    }

    const nome = `${lat},${lng}`;
    const descrizione = `${siteName} | Provider:${provider}`;
    const tags = JSON.stringify(['LTE/5G']);

    try {
      const result = await runAsync(
        'INSERT INTO markers (lat, lng, descrizione, nome, autore, tag, localita, frequenze) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione, nome, SOURCE, tags, null, null]
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
