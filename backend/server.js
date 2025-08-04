const express = require('express');
const path = require('path');
const authRouter = require('./auth');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const markersRouter = require('./markers');
const auditLogsRouter = require('./auditLogs');
const config = require('./config');

const app = express();
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve the static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.use('/auth', authRouter);
app.use('/markers', markersRouter);
app.use('/audit-logs', auditLogsRouter);

if (config.enableMapCache) {
  require('./scripts/update-map');
}

// Return the frontend for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/admin', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: 'Welcome admin!' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
