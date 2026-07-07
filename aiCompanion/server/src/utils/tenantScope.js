const db = require('../config/db');

// 强制注入 version_id 的查询封装。业务表读写必须经此层。
// scoped(versionId).select('sessions', 'WHERE status=?', ['open'])
//   => SELECT * FROM sessions WHERE version_id=? AND status=?  (versionId 前置)
function scoped(versionId) {
  return {
    async select(table, whereClause = '', params = []) {
      const extra = whereClause ? whereClause.replace(/^\s*WHERE\s+/i, ' AND ') : '';
      const [rows] = await db.query(
        `SELECT * FROM ${table} WHERE version_id=?${extra}`,
        [versionId, ...params]
      );
      return rows;
    },
    async insert(table, data) {
      const withVersion = { ...data, version_id: versionId };
      const keys = Object.keys(withVersion);
      const placeholders = keys.map(() => '?').join(',');
      const [result] = await db.query(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`,
        keys.map(k => withVersion[k])
      );
      return result;
    },
  };
}

module.exports = { scoped };
