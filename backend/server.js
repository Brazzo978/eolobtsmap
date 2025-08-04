const express = require('express');
const path = require('path');
const authRouter = require('./auth');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const markersRouter = require('./markers');
const auditLogsRouter = require('./auditLogs');
const usersRouter = require('./users');
const config = require('./config');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use('/uploads', express.static(config.uploadsDir));
// Serve the static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.use('/auth', authRouter);
app.use('/markers', markersRouter);
app.use('/audit-logs', auditLogsRouter);
app.use('/users', usersRouter);

if (config.enableMapCache) {
  require('./scripts/update-map');
}

// Return the frontend for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/admin', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

async function ensureAdmin() {
  const { username, password, email } = config.admin;
  db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return;
    if (!row) {
      const hashed = await bcrypt.hash(password, 10);
      db.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, hashed, 'admin']
      );
    }
  });
}
ensureAdmin();

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
