const express = require('express');
const path = require('path');
const authRouter = require('./auth');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const markersRouter = require('./markers');
const auditLogsRouter = require('./auditLogs');

const app = express();
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/auth', authRouter);
app.use('/markers', markersRouter);
app.use('/audit-logs', auditLogsRouter);

app.get('/admin', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: 'Welcome admin!' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
