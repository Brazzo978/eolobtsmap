const db = require('../db');
const { promisify } = require('util');

const allAsync = promisify(db.all).bind(db);
const runAsync = promisify(db.run).bind(db);

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function mergeMarkers(ids) {
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT m.*, mi.url, mi.didascalia FROM markers m LEFT JOIN marker_images mi ON m.id = mi.marker_id WHERE m.id IN (${placeholders})`;
  const rows = await allAsync(sql, ids);
  const markers = {};
  rows.forEach(row => {
    if (!markers[row.id]) {
      let parsedTags = [];
      if (row.tag) {
        try {
          const t = JSON.parse(row.tag);
          parsedTags = Array.isArray(t) ? t : [row.tag];
        } catch {
          parsedTags = [row.tag];
        }
      }
      let parsedDetails = null;
      if (row.tag_details) {
        try {
          parsedDetails = JSON.parse(row.tag_details);
        } catch {
          parsedDetails = null;
        }
      }
      markers[row.id] = {
        id: row.id,
        lat: row.lat,
        lng: row.lng,
        nome: row.nome,
        descrizione: row.descrizione,
        autore: row.autore,
        color: row.color,
        tags: parsedTags,
        localita: row.localita,
        frequenze: row.frequenze,
        images: [],
        tagDetails: parsedDetails
      };
    }
    if (row.url) {
      markers[row.id].images.push({ url: row.url, didascalia: row.didascalia });
    }
  });
  let list = ids.map(id => markers[id]).filter(Boolean);
  if (list.length < 2) return;

  // Remove markers that have the same description, keeping only the first
  const descSeen = new Set();
  list = list.filter(m => {
    const desc = (m.descrizione || '').trim();
    if (descSeen.has(desc)) return false;
    descSeen.add(desc);
    return true;
  });

  if (list.length < 2) {
    const baseId = list[0]?.id;
    if (baseId) {
      for (const id of ids) {
        if (id === baseId) continue;
        await runAsync('UPDATE audit_logs SET marker_id = ? WHERE marker_id = ?', [baseId, id]);
        await runAsync('DELETE FROM markers WHERE id = ?', [id]);
      }
    }
    return;
  }

  const baseId = list[0].id;
  const tagAgg = {};
  for (const m of list) {
    if (m.tagDetails) {
      for (const [t, info] of Object.entries(m.tagDetails)) {
        if (!tagAgg[t]) {
          tagAgg[t] = {
            descrizione: info.descrizione || null,
            frequenze: info.frequenze || null
          };
        } else {
          if (info.descrizione) {
            tagAgg[t].descrizione = tagAgg[t].descrizione
              ? tagAgg[t].descrizione + ' | ' + info.descrizione
              : info.descrizione;
          }
          if (info.frequenze) {
            const existing = tagAgg[t].frequenze
              ? tagAgg[t].frequenze.split(',').map(f => f.trim())
              : [];
            const newer = info.frequenze
              ? info.frequenze.split(',').map(f => f.trim())
              : [];
            tagAgg[t].frequenze = Array.from(new Set(existing.concat(newer))).join(', ');
          }
        }
      }
    }
  }
  const agg = {
    lat: list.reduce((s, m) => s + m.lat, 0) / list.length,
    lng: list.reduce((s, m) => s + m.lng, 0) / list.length,
    nome: Array.from(new Set(list.map(m => m.nome).filter(Boolean))).join(' / ') || null,
    descrizione: Array.from(new Set(list.map(m => m.descrizione).filter(Boolean))).join(' | ') || null,
    autore: list.find(m => m.autore)?.autore || null,
    color: list.find(m => m.color)?.color || null,
    frequenze: Array.from(new Set(list.flatMap(m => m.frequenze ? m.frequenze.split(',').map(f => f.trim()) : []))).join(', ') || null,
    localita: Array.from(new Set(list.map(m => m.localita).filter(Boolean))).join(' | ') || null,
    tags: Array.from(new Set(list.flatMap(m => m.tags || []))),
    images: list.flatMap(m => m.images).slice(0, 10),
    tagDetails: Object.keys(tagAgg).length ? tagAgg : null
  };
  await runAsync(
    'UPDATE markers SET lat = ?, lng = ?, descrizione = ?, nome = ?, autore = ?, color = ?, tag = ?, localita = ?, frequenze = ?, tag_details = ? WHERE id = ?',
    [
      agg.lat,
      agg.lng,
      agg.descrizione,
      agg.nome,
      agg.autore,
      agg.color,
      agg.tags.length ? JSON.stringify(agg.tags) : null,
      agg.localita,
      agg.frequenze,
      agg.tagDetails ? JSON.stringify(agg.tagDetails) : null,
      baseId
    ]
  );
  await runAsync('DELETE FROM marker_images WHERE marker_id = ?', [baseId]);
  await new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT INTO marker_images (marker_id, url, didascalia) VALUES (?, ?, ?)');
    let i = 0;
    const next = () => {
      if (i >= agg.images.length) {
        return stmt.finalize(err => (err ? reject(err) : resolve()));
      }
      const img = agg.images[i++];
      stmt.run(baseId, img.url, img.didascalia || null, err => {
        if (err) reject(err); else next();
      });
    };
    next();
  });
  for (const id of ids) {
    if (id === baseId) continue;
    await runAsync('UPDATE audit_logs SET marker_id = ? WHERE marker_id = ?', [baseId, id]);
    await runAsync('DELETE FROM markers WHERE id = ?', [id]);
  }
}

async function mergeNearby(dist) {
  const markers = await allAsync('SELECT id, lat, lng FROM markers');
  const clusters = [];
  const used = new Set();
  for (const m of markers) {
    if (used.has(m.id)) continue;
    const cluster = [m];
    used.add(m.id);
    let added = true;
    while (added) {
      added = false;
      for (const n of markers) {
        if (used.has(n.id)) continue;
        if (cluster.some((c) => haversine(c.lat, c.lng, n.lat, n.lng) <= dist)) {
          cluster.push(n);
          used.add(n.id);
          added = true;
        }
      }
    }
    if (cluster.length > 1) {
      clusters.push(cluster.map((c) => c.id));
    }
  }
  let merged = 0;
  for (const ids of clusters) {
    await mergeMarkers(ids);
    merged += ids.length - 1;
  }
  return merged;
}

module.exports = { mergeNearby };

if (require.main === module) {
  (async () => {
    const dist = parseFloat(process.argv[2]);
    if (isNaN(dist)) {
      console.error('Usage: node scripts/merge-nearby.js <distance-meters>');
      process.exit(1);
    }
    const merged = await mergeNearby(dist);
    console.log(`Uniti ${merged} marker`);
    db.close();
  })();
}
