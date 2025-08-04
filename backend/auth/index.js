const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db');
const config = require('../config');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'secret';

router.post('/register', async (req, res) => {
  const { username, password, role, email } = req.body;
  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashed, role || 'user'],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'User already exists' });
        }
        res.json({ id: this.lastID, username, role: role || 'user', email });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, SECRET, { expiresIn: '1h' });
    res.json({ token });
  });
});

router.post('/request-reset', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) {
      return res.status(200).json({}); // Avoid user enumeration
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour
    db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
    const resetUrl = `${req.protocol}://${req.get('host')}/reset.html?token=${token}`;
    transporter.sendMail({
      from: config.smtp.user,
      to: email,
      subject: 'Password Reset',
      text: `Reset your password: ${resetUrl}`,
    });
    res.json({});
  });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing fields' });
  db.get('SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?', [token, Date.now()], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid token' });
    }
    const hashed = await bcrypt.hash(password, 10);
    db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hashed, user.id], (e2) => {
      if (e2) return res.status(500).json({ error: 'Reset failed' });
      res.json({});
    });
  });
});

module.exports = router;
