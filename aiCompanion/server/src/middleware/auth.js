const { verify } = require('../utils/jwt');
const { fail } = require('../utils/errors');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, '未登录');
  try {
    req.user = verify(token);  // { id, username, isSuperAdmin }
    next();
  } catch {
    fail(res, 401, 'token 已过期或无效');
  }
};
