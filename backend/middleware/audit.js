const db = require('../db');

function logMarkerAction(action) {
  return (req, res, next) => {
    const userId = req.user ? req.user.id : null;
    const markerId = action === 'delete' ? null : res.locals.markerId || req.params.id;
    db.run(
      'INSERT INTO audit_logs (user_id, action, marker_id) VALUES (?, ?, ?)',
      [userId, action, markerId],
      (err) => {
        if (err) {
          console.error('Audit log error:', err);
        }
        next();
      }
    );
  };
}

module.exports = { logMarkerAction };
