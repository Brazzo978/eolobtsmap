const db = require('../db');

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function existsNearbyMarker(lat, lng, radius) {
  const latDelta = radius / 111320; // rough degrees per meter
  const lngDelta = radius / (111320 * Math.cos(toRad(lat)));
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT lat, lng FROM markers WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta],
      (err, rows) => {
        if (err) return reject(err);
        for (const row of rows) {
          const dist = haversine(lat, lng, row.lat, row.lng);
          if (dist <= radius) {
            return resolve(true);
          }
        }
        resolve(false);
      }
    );
  });
}

module.exports = { existsNearbyMarker };

