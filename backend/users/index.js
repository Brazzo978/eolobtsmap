const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { handleDbError } = require('../db-utils');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken, authorizeRole('admin'));

router.get('/', (req, res) => {
  db.all('SELECT id, username, email, role FROM users', [], (err, rows) => {
    if (err) return handleDbError(res, err);
    res.json(rows);
  });
});

router.post('/', async (req, res) => {
  const { username, password, email, role } = req.body;
  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashed, role || 'user'],
        function (err) {
        if (err) return handleDbError(res, err, 'User exists');
        res.status(201).json({ id: this.lastID, username, email, role: role || 'user' });
      }
    );
  } catch (e) {
    console.error('Creation failed', e);
    res.status(500).json({ error: 'Creation failed' });
  }
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
    if (err) return handleDbError(res, err);
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.sendStatus(204);
  });
});

module.exports = router;
