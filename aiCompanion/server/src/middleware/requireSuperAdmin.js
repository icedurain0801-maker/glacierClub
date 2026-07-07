const auth = require('./auth');
const { fail } = require('../utils/errors');

module.exports = [
  auth,
  function superAdminOnly(req, res, next) {
    if (!req.user.isSuperAdmin) return fail(res, 403, '仅超级管理员可操作');
    next();
  },
];
