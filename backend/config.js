const path = require('path');

module.exports = {
  enableMapCache: process.env.ENABLE_MAP_CACHE === 'true',
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'),
  dbDir: process.env.DB_DIR || __dirname,
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'adminpass',
    email: process.env.ADMIN_EMAIL || 'admin@example.com'
  },
  smtp: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};
