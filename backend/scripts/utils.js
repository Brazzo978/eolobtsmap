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
      'SELECT id, lat, lng, descrizione FROM markers WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
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

module.exports = { findNearbyMarker };
