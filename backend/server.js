const express = require('express');
const path = require('path');
const fs = require('fs');
const authRouter = require('./auth');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const markersRouter = require('./markers');
const auditLogsRouter = require('./auditLogs');
const usersRouter = require('./users');
const config = require('./config');
const { loadTags, saveTags } = require('./tags');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(config.uploadsDir));
// Serve the static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.use('/auth', authRouter);
app.use('/markers', markersRouter);
app.use('/audit-logs', auditLogsRouter);
app.use('/users', usersRouter);
app.get('/tags', (req, res) => {
  res.json(loadTags());
});

const annotationsDir = path.join(__dirname, '..', 'data', 'annotations');
fs.mkdirSync(annotationsDir, { recursive: true });

app.post('/annotate', (req, res) => {
  const { image, bbox } = req.body || {};
  if (!image || !bbox) {
    return res.status(400).json({ error: 'Missing data' });
  }
  const match = image.match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image data' });
  }
  const buffer = Buffer.from(match[1], 'base64');
  const base = `annotation-${Date.now()}`;
  fs.writeFileSync(path.join(annotationsDir, `${base}.png`), buffer);
  const line = `0 ${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`;
  fs.writeFileSync(path.join(annotationsDir, `${base}.txt`), line);
  res.json({ status: 'ok' });
});

app.put('/tags', authenticateToken, authorizeRole('admin'), (req, res) => {
  const newTags = req.body;
  if (!newTags || typeof newTags !== 'object' || Array.isArray(newTags)) {
    return res.status(400).json({ error: 'Invalid tag format' });
  }
  try {
    saveTags(newTags);
    res.json(newTags);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save tags' });
  }
});

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
