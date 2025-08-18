const db = require('../db');

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) * Math.sin(dphi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearbyMarker(lat, lng, radiusMeters) {
  return new Promise((resolve, reject) => {
    const latDeg = radiusMeters / 111320; // approx meters per degree lat
    const latRad = (lat * Math.PI) / 180;
    const lngDeg = radiusMeters / (111320 * Math.cos(latRad));
    const params = [lat - latDeg, lat + latDeg, lng - lngDeg, lng + lngDeg];
    db.all(
      'SELECT id, lat, lng, descrizione, tag, frequenze, tag_details FROM markers WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
      params,
      (err, rows) => {
        if (err) return reject(err);
        for (const row of rows) {
          const d = haversineDistance(lat, lng, row.lat, row.lng);
          if (d <= radiusMeters) return resolve(row);
        }
        resolve(null);
      }
    );
  });
}

function mergeTagData(existing, newTags, newDetails) {
  let tags = [];
  let details = {};
  try {
    tags = existing.tag ? JSON.parse(existing.tag) : [];
  } catch {
    tags = [];
  }
  try {
    details = existing.tag_details ? JSON.parse(existing.tag_details) : {};
  } catch {
    details = {};
  }

  if (tags.length && Object.keys(details).length === 0) {
    const defDesc = existing.descrizione || null;
    const defFreq = existing.frequenze || null;
    tags.forEach((t) => {
      details[t] = { descrizione: defDesc, frequenze: defFreq };
    });
  }

  newTags.forEach((t) => {
    if (!tags.includes(t)) tags.push(t);
    const info = newDetails[t] || { descrizione: null, frequenze: null };
    if (details[t]) {
      if (info.descrizione) {
        details[t].descrizione = details[t].descrizione
          ? `${details[t].descrizione} | ${info.descrizione}`
          : info.descrizione;
      }
      if (info.frequenze) {
        const existingF = details[t].frequenze
          ? details[t].frequenze.split(',').map((f) => f.trim())
          : [];
        const newF = info.frequenze
          ? info.frequenze.split(',').map((f) => f.trim())
          : [];
        details[t].frequenze = Array.from(new Set(existingF.concat(newF))).join(', ');
      }
    } else {
      details[t] = { descrizione: info.descrizione || null, frequenze: info.frequenze || null };
    }
  });

  return { tags, details };
}

module.exports = { findNearbyMarker, mergeTagData };
