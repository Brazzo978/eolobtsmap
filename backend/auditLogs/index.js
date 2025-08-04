const express = require('express');
const db = require('../db');
const { handleDbError } = require('../db-utils');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, authorizeRole('admin'), (req, res) => {
  db.all('SELECT * FROM audit_logs ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) {
      return handleDbError(res, err);
    }
    res.json(rows);
  });
});

module.exports = router;
