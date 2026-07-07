require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // 1) 跑 .sql 文件
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    console.log(`Running ${file}...`);
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    await conn.query(sql);
    console.log('  ✓ done');
  }

  await conn.query(`USE ${process.env.DB_NAME || 'ai_companion'}`);

  // 2) 种子：示例版本
  const versions = [
    ['lighthouse_cn', '灯塔', '国内', '灯塔·国内'],
    ['lighthouse_os', '灯塔', '海外', '灯塔·海外'],
    ['superpower_cn', '超能世界', '国内', '超能世界·国内'],
    ['superpower_os', '超能世界', '海外', '超能世界·海外'],
  ];
  for (const [code, game, region, display] of versions) {
    await conn.query(
      'INSERT IGNORE INTO versions (code, game_name, region, display_name) VALUES (?,?,?,?)',
      [code, game, region, display]
    );
  }

  // 3) 种子：超管
  const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
  const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
  const [existing] = await conn.query('SELECT id FROM users WHERE username=?', [adminUser]);
  if (existing.length === 0) {
    const hash = await bcrypt.hash(adminPass, 10);
    await conn.query(
      'INSERT INTO users (username, password_hash, display_name, is_super_admin) VALUES (?,?,?,1)',
      [adminUser, hash, '超级管理员']
    );
    console.log(`[seed] 超管已创建：${adminUser}`);
  } else {
    console.log('[seed] 超管已存在，跳过');
  }

  await conn.end();
  console.log('\nAll migrations complete.');
}

run().catch(err => { console.error(err); process.exit(1); });
