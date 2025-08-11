const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../db');

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
  if (!filePath) {
    console.error('Usage: node scripts/import-lteitaly.js <file.ntm>');
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

    const lat = parseFloat(parts[7]);
    const lng = parseFloat(parts[8]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const key = `${lat},${lng}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tokens = parts[9].trim().split(/\s+/);
    const siteName = tokens.slice(3).join(' ');

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
