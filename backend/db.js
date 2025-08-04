const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./config');

const dbPath = path.join(config.dbDir, 'data.sqlite');
fs.mkdirSync(config.dbDir, { recursive: true });
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`Failed to connect to database at ${dbPath}:`, err);
  } else {
    console.log(`Connected to database at ${dbPath}`);
  }
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    reset_token TEXT,
    reset_expires INTEGER
  )`);

  // Ensure legacy databases have the new columns
  db.run('ALTER TABLE users ADD COLUMN email TEXT UNIQUE', () => {});
  db.run('ALTER TABLE users ADD COLUMN reset_token TEXT', () => {});
  db.run('ALTER TABLE users ADD COLUMN reset_expires INTEGER', () => {});

  db.run(`CREATE TABLE IF NOT EXISTS markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    nome TEXT,
    descrizione TEXT,
    autore TEXT,
    color TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Ensure legacy databases have the new columns
  db.run('ALTER TABLE markers ADD COLUMN color TEXT', () => {});

  db.run(`CREATE TABLE IF NOT EXISTS marker_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marker_id INTEGER,
    url TEXT,
    didascalia TEXT,
    FOREIGN KEY(marker_id) REFERENCES markers(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    marker_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(marker_id) REFERENCES markers(id)
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_markers_lat_lng ON markers(lat, lng)`);
});

module.exports = db;
