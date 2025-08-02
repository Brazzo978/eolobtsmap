const express = require('express');
const authRouter = require('./auth');
const { authenticateToken, authorizeRole } = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

app.get('/admin', authenticateToken, authorizeRole('admin'), (req, res) => {
  res.json({ message: 'Welcome admin!' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
