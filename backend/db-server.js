const path = require('path');
const config = require('./config');
require('./db');

console.log(`Database ready at ${path.join(config.dbDir, 'data.sqlite')}`);
console.log('Database process running. Press Ctrl+C to stop.');

setInterval(() => {}, 1 << 30);
