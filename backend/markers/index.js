const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

function validateMarkerInput(req, res, next) {
  const { lat, lng, descrizione, images } = req.body;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  if (descrizione && typeof descrizione !== 'string') {
    return res.status(400).json({ error: 'Invalid descrizione' });
  }
  if (images) {
    if (!Array.isArray(images)) {
      return res.status(400).json({ error: 'Images must be an array' });
    }
    for (const img of images) {
      if (typeof img.url !== 'string' || (img.didascalia && typeof img.didascalia !== 'string')) {
        return res.status(400).json({ error: 'Invalid image format' });
      }
    }
  }
  next();
}

router.get('/', (req, res) => {
  const sql = `SELECT m.*, mi.id as image_id, mi.url, mi.didascalia
               FROM markers m LEFT JOIN marker_images mi ON m.id = mi.marker_id`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'DB error' });
    }
    const markers = {};
    rows.forEach((row) => {
      if (!markers[row.id]) {
        markers[row.id] = {
          id: row.id,
          lat: row.lat,
          lng: row.lng,
          nome: row.nome,
          descrizione: row.descrizione,
          autore: row.autore,
          timestamp: row.timestamp,
          images: [],
        };
      }
      if (row.image_id) {
        markers[row.id].images.push({
          id: row.image_id,
          url: row.url,
          didascalia: row.didascalia,
        });
      }
    });
    res.json(Object.values(markers));
  });
});

router.get('/:id', (req, res) => {
  const id = req.params.id;
  const sql = `SELECT m.*, mi.id as image_id, mi.url, mi.didascalia
               FROM markers m LEFT JOIN marker_images mi ON m.id = mi.marker_id
               WHERE m.id = ?`;
  db.all(sql, [id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'DB error' });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const marker = {
      id: rows[0].id,
      lat: rows[0].lat,
      lng: rows[0].lng,
      nome: rows[0].nome,
      descrizione: rows[0].descrizione,
      autore: rows[0].autore,
      timestamp: rows[0].timestamp,
      images: [],
    };
    rows.forEach((row) => {
      if (row.image_id) {
        marker.images.push({
          id: row.image_id,
          url: row.url,
          didascalia: row.didascalia,
        });
      }
    });
    res.json(marker);
  });
});

router.post('/', authenticateToken, authorizeRoles('admin', 'editor'), validateMarkerInput, (req, res) => {
  const { lat, lng, descrizione, images, nome, autore } = req.body;
  db.run(
    'INSERT INTO markers (lat, lng, descrizione, nome, autore) VALUES (?, ?, ?, ?, ?)',
    [lat, lng, descrizione || null, nome || null, autore || null],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'DB error' });
      }
      const markerId = this.lastID;
      if (images && images.length) {
        const stmt = db.prepare(
          'INSERT INTO marker_images (marker_id, url, didascalia) VALUES (?, ?, ?)'
        );
        for (const img of images) {
          stmt.run(markerId, img.url, img.didascalia || null);
        }
        stmt.finalize((err2) => {
          if (err2) {
            return res.status(500).json({ error: 'DB error' });
          }
          res.status(201).json({ id: markerId });
        });
      } else {
        res.status(201).json({ id: markerId });
      }
    }
  );
});

router.put('/:id', authenticateToken, authorizeRoles('admin', 'editor'), validateMarkerInput, (req, res) => {
  const { lat, lng, descrizione, images, nome, autore } = req.body;
  const id = req.params.id;
  db.run(
    'UPDATE markers SET lat = ?, lng = ?, descrizione = ?, nome = ?, autore = ? WHERE id = ?',
    [lat, lng, descrizione || null, nome || null, autore || null, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'DB error' });
      }
      db.run('DELETE FROM marker_images WHERE marker_id = ?', [id], (err2) => {
        if (err2) {
          return res.status(500).json({ error: 'DB error' });
        }
        if (images && images.length) {
          const stmt = db.prepare(
            'INSERT INTO marker_images (marker_id, url, didascalia) VALUES (?, ?, ?)'
          );
          for (const img of images) {
            stmt.run(id, img.url, img.didascalia || null);
          }
          stmt.finalize((err3) => {
            if (err3) {
              return res.status(500).json({ error: 'DB error' });
            }
            res.json({ id });
          });
        } else {
          res.json({ id });
        }
      });
    }
  );
});

router.delete('/:id', authenticateToken, authorizeRoles('admin', 'editor'), (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM markers WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'DB error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendStatus(204);
  });
});

module.exports = router;

