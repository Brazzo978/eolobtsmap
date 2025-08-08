const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const db = require('../db');
const { authenticateToken, authorizeRoles, authorizeRole } = require('../middleware/auth');
const { logMarkerAction } = require('../middleware/audit');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

function validateMarkerInput(req, res, next) {
  const { lat, lng, descrizione, images, color, tags, frequenze } = req.body;
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
    if (images.length > 10) {
      return res.status(400).json({ error: 'Max 10 images per marker' });
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
  if (frequenze && typeof frequenze !== 'string') {
    return res.status(400).json({ error: 'Invalid frequenze' });
  }
  if (tags) {
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Invalid tags' });
    }
    for (const t of tags) {
      if (typeof t !== 'string') {
        return res.status(400).json({ error: 'Invalid tags' });
      }
    }
  }
  next();
}

router.get('/', (req, res) => {
  const tagFilter = req.query.tag;
  let sql = `SELECT m.*, mi.id as image_id, mi.url, mi.didascalia
               FROM markers m LEFT JOIN marker_images mi ON m.id = mi.marker_id`;
  const params = [];
  if (tagFilter) {
    sql += ' WHERE m.tag LIKE ?';
    params.push(`%${tagFilter}%`);
  }
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'DB error' });
    }
    const markers = {};
    rows.forEach((row) => {
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
    let parsedTags = [];
    if (rows[0].tag) {
      try {
        const t = JSON.parse(rows[0].tag);
        parsedTags = Array.isArray(t) ? t : [rows[0].tag];
      } catch {
        parsedTags = [rows[0].tag];
      }
    }
    const marker = {
      id: rows[0].id,
      lat: rows[0].lat,
      lng: rows[0].lng,
      nome: rows[0].nome,
      descrizione: rows[0].descrizione,
      autore: rows[0].autore,
      color: rows[0].color,
      tags: parsedTags,
      localita: rows[0].localita,
      frequenze: rows[0].frequenze,
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
  async (req, res, next) => {
    const { lat, lng, descrizione, images, nome, autore, color, tags, frequenze } = req.body;

    let localita = null;
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        { headers: { 'User-Agent': 'btsmap/1.0' } }
      );
      if (resp.ok) {
        const data = await resp.json();
        localita = data.display_name || null;
      }
    } catch (e) {
      // Ignore geocoding errors
    }

    db.run(
      'INSERT INTO markers (lat, lng, descrizione, nome, autore, color, tag, localita, frequenze) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        lat,
        lng,
        descrizione || null,
        nome || null,
        autore || null,
        color || null,
        tags ? JSON.stringify(tags) : null,
        localita,
        frequenze || null,
      ],
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
            res.locals.markerId = markerId;
            res.status(201).json({ id: markerId, localita });
            next();
          });
        } else {
          res.locals.markerId = markerId;
          res.status(201).json({ id: markerId, localita });
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
    const { lat, lng, descrizione, images, nome, autore, color, tags, frequenze } = req.body;
    const id = req.params.id;
    db.run(
      'UPDATE markers SET lat = ?, lng = ?, descrizione = ?, nome = ?, autore = ?, color = ?, tag = ?, frequenze = ? WHERE id = ?',
      [
        lat,
        lng,
        descrizione || null,
        nome || null,
        autore || null,
        color || null,
        tags ? JSON.stringify(tags) : null,
        frequenze || null,
        id,
      ],
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
    db.get(
      'SELECT COUNT(*) as cnt FROM marker_images WHERE marker_id = ?',
      [markerId],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'DB error' });
        }
        if (row.cnt >= 10) {
          return res.status(400).json({ error: 'Max 10 images per marker' });
        }
        const saveUrl = (url) => {
          db.run(
            'INSERT INTO marker_images (marker_id, url, didascalia) VALUES (?, ?, ?)',
            [markerId, url, didascalia],
            function (err2) {
              if (err2) {
                return res.status(500).json({ error: 'DB error' });
              }
              res.status(201).json({ id: this.lastID, url });
            }
          );
        };
        const uploadsDir = config.uploadsDir;
        fs.mkdirSync(uploadsDir, { recursive: true });
        const filename = `${Date.now()}_${file.originalname}`;
        fs.writeFile(path.join(uploadsDir, filename), file.buffer, (err3) => {
          if (err3) {
            return res.status(500).json({ error: 'Upload error' });
          }
          saveUrl(`/uploads/${filename}`);
        });
      }
    );
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
          return res.status(500).json({ error: 'DB error' });
        }
        if (!row) {
          return res.status(404).json({ error: 'Not found' });
        }
        db.run(
          'DELETE FROM marker_images WHERE id = ?',
          [imageId],
          (err2) => {
            if (err2) {
              return res.status(500).json({ error: 'DB error' });
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

router.post(
  '/merge',
  authenticateToken,
  authorizeRole('admin'),
  (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length < 2) {
      return res.status(400).json({ error: 'At least two IDs required' });
    }
    const placeholders = ids.map(() => '?').join(',');
    const sql =
      `SELECT m.*, mi.url, mi.didascalia FROM markers m LEFT JOIN marker_images mi ON m.id = mi.marker_id WHERE m.id IN (${placeholders})`;
    db.all(sql, ids, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'DB error' });
      }
      const markers = {};
      rows.forEach((row) => {
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
          };
        }
        if (row.url) {
          markers[row.id].images.push({ url: row.url, didascalia: row.didascalia });
        }
      });
      const list = ids.map((id) => markers[id]).filter(Boolean);
      if (list.length < 2) {
        return res.status(404).json({ error: 'Markers not found' });
      }
      const baseId = list[0].id;
      const agg = {
        lat: list.reduce((s, m) => s + m.lat, 0) / list.length,
        lng: list.reduce((s, m) => s + m.lng, 0) / list.length,
        nome: Array.from(new Set(list.map((m) => m.nome).filter(Boolean))).join(' / ') || null,
        descrizione:
          Array.from(new Set(list.map((m) => m.descrizione).filter(Boolean))).join(' | ') || null,
        autore: list.find((m) => m.autore)?.autore || null,
        color: list.find((m) => m.color)?.color || null,
        frequenze:
          Array.from(
            new Set(
              list.flatMap((m) =>
                m.frequenze ? m.frequenze.split(',').map((f) => f.trim()) : []
              )
            )
          ).join(', ') || null,
        localita:
          Array.from(new Set(list.map((m) => m.localita).filter(Boolean))).join(' | ') || null,
        tags: Array.from(new Set(list.flatMap((m) => m.tags || []))),
        images: list.flatMap((m) => m.images).slice(0, 10),
      };
      db.serialize(() => {
        db.run(
          'UPDATE markers SET lat = ?, lng = ?, descrizione = ?, nome = ?, autore = ?, color = ?, tag = ?, localita = ?, frequenze = ? WHERE id = ?',
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
            baseId,
          ]
        );
        db.run('DELETE FROM marker_images WHERE marker_id = ?', [baseId]);
        const stmt = db.prepare(
          'INSERT INTO marker_images (marker_id, url, didascalia) VALUES (?, ?, ?)'
        );
        for (const img of agg.images) {
          stmt.run(baseId, img.url, img.didascalia || null);
        }
        stmt.finalize();
        const others = ids.filter((id) => id !== baseId);
        const deleteNext = (idx) => {
          if (idx >= others.length) {
            db.get('SELECT * FROM markers WHERE id = ?', [baseId], (err2, row) => {
              if (err2) {
                return res.status(500).json({ error: 'DB error' });
              }
              let parsedTags = [];
              if (row.tag) {
                try {
                  const t = JSON.parse(row.tag);
                  parsedTags = Array.isArray(t) ? t : [row.tag];
                } catch {
                  parsedTags = [row.tag];
                }
              }
              const result = {
                id: row.id,
                lat: row.lat,
                lng: row.lng,
                nome: row.nome,
                descrizione: row.descrizione,
                autore: row.autore,
                color: row.color,
                localita: row.localita,
                frequenze: row.frequenze,
                tags: parsedTags,
                images: agg.images,
              };
              return res.json(result);
            });
            return;
          }
          const id = others[idx];
          db.run(
            'UPDATE audit_logs SET marker_id = ? WHERE marker_id = ?',
            [baseId, id],
            (err3) => {
              if (err3) {
                return res.status(500).json({ error: 'DB error' });
              }
              db.run('DELETE FROM markers WHERE id = ?', [id], (err4) => {
                if (err4) {
                  return res.status(500).json({ error: 'DB error' });
                }
                deleteNext(idx + 1);
              });
            }
          );
        };
        deleteNext(0);
      });
    });
  }
);

router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('admin', 'editor'),
  (req, res, next) => {
    const id = req.params.id;
    // Clear references from audit logs to avoid FK constraint errors
    db.run('UPDATE audit_logs SET marker_id = NULL WHERE marker_id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'DB error' });
      }
      db.run('DELETE FROM markers WHERE id = ?', [id], function (err2) {
        if (err2) {
          return res.status(500).json({ error: 'DB error' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.locals.markerId = id;
        res.sendStatus(204);
        next();
      });
    });
  },
  logMarkerAction('delete')
);

module.exports = router;

