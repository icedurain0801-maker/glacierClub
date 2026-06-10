const { verify } = require('../utils/jwt');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });

  try {
    req.user = verify(token);
    next();
  } catch {
    res.status(401).json({ error: 'token 已过期或无效' });
  }
};
