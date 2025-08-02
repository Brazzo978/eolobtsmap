const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRole('admin'), (req, res) => {
  db.all('SELECT * FROM audit_logs ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

module.exports = router;
