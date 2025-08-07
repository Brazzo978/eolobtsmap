const defaultUploadsDir = '/opt/media';
const defaultDbDir = '/opt/database';

module.exports = {
  enableMapCache: process.env.ENABLE_MAP_CACHE === 'true',
  
  uploadsDir: process.env.UPLOADS_DIR || defaultUploadsDir,
  dbDir: process.env.DB_DIR || defaultDbDir,
  
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

// printa i percorsi usati
console.log('Database directory:', module.exports.dbDir);
console.log('Uploads directory:', module.exports.uploadsDir);
