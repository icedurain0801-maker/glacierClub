const auth = require('./auth');

module.exports = [
  auth,
  function adminOnly(req, res, next) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  },
];
