const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const db = require('../db');
const { handleDbError } = require('../db-utils');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { logMarkerAction } = require('../middleware/audit');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

function validateMarkerInput(req, res, next) {
  const { lat, lng, descrizione, images, color } = req.body;
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
  if (color && typeof color !== 'string') {
    return res.status(400).json({ error: 'Invalid color' });
  }
  next();
}

router.get('/', (req, res) => {
  const sql = `SELECT m.*, mi.id as image_id, mi.url, mi.didascalia
               FROM markers m LEFT JOIN marker_images mi ON m.id = mi.marker_id`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        return handleDbError(res, err);
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
          color: row.color,
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
        return handleDbError(res, err);
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
      color: rows[0].color,
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

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'editor'),
  validateMarkerInput,
  (req, res, next) => {
    const { lat, lng, descrizione, images, nome, autore, color } = req.body;
      db.run(
        'INSERT INTO markers (lat, lng, descrizione, nome, autore, color) VALUES (?, ?, ?, ?, ?, ?)',
        [lat, lng, descrizione || null, nome || null, autore || null, color || null],
        function (err) {
          if (err) {
            return handleDbError(res, err);
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
                return handleDbError(res, err2);
              }
            res.locals.markerId = markerId;
            res.status(201).json({ id: markerId });
            next();
          });
        } else {
          res.locals.markerId = markerId;
          res.status(201).json({ id: markerId });
          next();
        }
      }
    );
  },
  logMarkerAction('create')
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('admin', 'editor'),
  validateMarkerInput,
  (req, res, next) => {
    const { lat, lng, descrizione, images, nome, autore, color } = req.body;
    const id = req.params.id;
      db.run(
        'UPDATE markers SET lat = ?, lng = ?, descrizione = ?, nome = ?, autore = ?, color = ? WHERE id = ?',
        [lat, lng, descrizione || null, nome || null, autore || null, color || null, id],
        function (err) {
          if (err) {
            return handleDbError(res, err);
          }
          db.run('DELETE FROM marker_images WHERE marker_id = ?', [id], (err2) => {
            if (err2) {
              return handleDbError(res, err2);
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
                  return handleDbError(res, err3);
                }
              res.locals.markerId = id;
              res.json({ id });
              next();
            });
          } else {
            res.locals.markerId = id;
            res.json({ id });
            next();
          }
        });
      }
    );
  },
  logMarkerAction('update')
);

router.post(
  '/:id/images',
  authenticateToken,
  authorizeRoles('admin', 'editor'),
  upload.single('image'),
  (req, res) => {
    const markerId = req.params.id;
    const file = req.file;
    const didascalia = req.body.didascalia || null;
    if (!file) {
      return res.status(400).json({ error: 'Image file is required' });
    }
    const saveUrl = (url) => {
        db.run(
          'INSERT INTO marker_images (marker_id, url, didascalia) VALUES (?, ?, ?)',
          [markerId, url, didascalia],
          function (err) {
            if (err) {
              return handleDbError(res, err);
            }
            res.status(201).json({ id: this.lastID, url });
          }
        );
    };
    const uploadsDir = config.uploadsDir;
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `${Date.now()}_${file.originalname}`;
      fs.writeFile(path.join(uploadsDir, filename), file.buffer, (err) => {
        if (err) {
          console.error('Upload error', err);
          return res.status(500).json({ error: 'Upload error' });
        }
        saveUrl(`/uploads/${filename}`);
      });
  }
);

router.delete(
  '/:markerId/images/:imageId',
  authenticateToken,
  authorizeRoles('admin', 'editor'),
  (req, res) => {
    const { markerId, imageId } = req.params;
      db.get(
        'SELECT url FROM marker_images WHERE id = ? AND marker_id = ?',
        [imageId, markerId],
        (err, row) => {
          if (err) {
            return handleDbError(res, err);
          }
        if (!row) {
          return res.status(404).json({ error: 'Not found' });
        }
          db.run(
            'DELETE FROM marker_images WHERE id = ?',
            [imageId],
            (err2) => {
              if (err2) {
                return handleDbError(res, err2);
              }
            const filePath = path.join(
              config.uploadsDir,
              path.basename(row.url)
            );
            fs.unlink(filePath, () => {
              res.sendStatus(204);
            });
          }
        );
      }
    );
  }
);

router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('admin', 'editor'),
  (req, res, next) => {
    const id = req.params.id;
    db.run('DELETE FROM markers WHERE id = ?', [id], function (err) {
      if (err) {
        return handleDbError(res, err);
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.locals.markerId = id;
      res.sendStatus(204);
      next();
    });
  },
  logMarkerAction('delete')
);

module.exports = router;

