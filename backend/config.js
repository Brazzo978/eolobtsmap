module.exports = {
  enableMapCache: process.env.ENABLE_MAP_CACHE === 'true',
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
