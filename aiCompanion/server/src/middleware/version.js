const auth = require('./auth');
const db = require('../config/db');
const { fail } = require('../utils/errors');

// 校验当前用户对 X-Version-Id 是否有权限，挂 req.versionId
async function resolveVersion(req, res, next) {
  const versionId = parseInt(req.headers['x-version-id'], 10);
  if (!versionId) return fail(res, 400, '缺少版本标识 X-Version-Id');

  const [vRows] = await db.query('SELECT id FROM versions WHERE id=? AND status="active"', [versionId]);
  if (vRows.length === 0) return fail(res, 404, '版本不存在');

  if (req.user.isSuperAdmin) {
    req.versionId = versionId;
    return next();
  }

  const [rows] = await db.query(
    'SELECT id FROM user_version_roles WHERE user_id=? AND version_id=?',
    [req.user.id, versionId]
  );
  if (rows.length === 0) return fail(res, 403, '无权限访问该版本');

  req.versionId = versionId;
  next();
}

module.exports = [auth, resolveVersion];
