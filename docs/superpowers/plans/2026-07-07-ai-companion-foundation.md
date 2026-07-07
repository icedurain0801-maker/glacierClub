# AI 陪伴机器人 · 子项目1「多版本+鉴权地基」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 AI 陪伴机器人 B 端后台的地基——多版本(游戏×地区)多租户隔离 + 全局账号按版本授权的 RBAC，含真实登录、版本切换、用户权限管理、版本管理。

**Architecture:** Express + MySQL + JWT 后端（对齐现有 `worldCupBetting-server`）+ 原生 HTML/CSS/JS 后台。数据隔离用「共享表 + version_id 列」，通过三层中间件（auth → version → tenantScope）在后端强制注入 `version_id`，前端传的版本头不被信任。

**Tech Stack:** Node.js、Express、mysql2、bcryptjs、jsonwebtoken、dotenv、cors；原生前端 fetch。

---

## 前置说明（执行者必读）

- **工作目录**：所有后端代码在 `aiCompanion/server/`，前端在 `aiCompanion/web/`，均相对仓库根目录 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/AIpeiban/.claude/worktrees/awesome-swartz-60dec9`。
- **提交被坏钩子拦截**：本仓库 `.git/hooks/pre-commit` 是遗留的 Husky v4 坏钩子，会报 `could not determine executable to run`。所有 `git commit` 前缀 `HUSKY_SKIP_HOOKS=1`（钩子自带的官方跳过开关，非 `--no-verify`）。
- **代码风格对齐**：db 连接放 `src/config/db.js`，jwt 工具放 `src/utils/jwt.js`，中间件放 `src/middleware/`，路由放 `src/routes/`，错误响应用 `{ error: '中文提示' }`（与现有 server 一致）。注意：spec 里写的 `db.js` 实际落到 `config/db.js`。
- **测试方式**：后端用一个 Node 脚本 `server/test/run.js`，Node 内置 `assert` + `http` 真实调用；不引入测试框架。前端用 `node --check` 校验语法。
- **数据库**：需要一个可连的 MySQL。执行者若本地没有，跑迁移和后端测试会失败——这种情况下完成代码编写、`node --check` 通过即可，并在提交信息注明「未连库验证」。

---

## 文件结构

**后端 `aiCompanion/server/`**
- `package.json` — 依赖与脚本（dev/start/migrate/test）
- `.env.example` — 环境变量模板
- `.gitignore` — 忽略 node_modules/.env
- `src/app.js` — 入口，挂载路由 + 统一错误处理 + 健康检查
- `src/config/db.js` — mysql2 连接池
- `src/utils/jwt.js` — sign/verify
- `src/utils/errors.js` — 统一错误响应 helper
- `src/middleware/auth.js` — 校验 JWT，挂 `req.user`
- `src/middleware/requireSuperAdmin.js` — 超管校验
- `src/middleware/version.js` — 校验用户对 `X-Version-Id` 的权限，挂 `req.versionId`
- `src/utils/tenantScope.js` — 统一查询层，强制注入 `version_id`
- `src/routes/auth.js` — 登录、当前用户信息+可访问版本
- `src/routes/versions.js` — 版本列表、新建版本
- `src/routes/users.js` — 用户列表、新建用户、授权/取消授权
- `migrations/001_init.sql` — 建表
- `migrations/002_seed.sql` — 种子（超管 + 示例版本，密码哈希由脚本注入见 Task 2）
- `migrations/run.js` — 迁移执行器
- `test/run.js` — 后端集成测试脚本

**前端 `aiCompanion/web/`**
- `index.html` — 登录页
- `admin.html` — 后台外壳（左侧菜单 + 右上角版本切换器）
- `css/style.css` — 样式
- `js/api.js` — fetch 封装，自动带 token + X-Version-Id
- `js/auth.js` — 登录页逻辑
- `js/app.js` — 后台外壳、版本切换、菜单路由
- `js/pages/versions.js` — 版本管理页
- `js/pages/users.js` — 用户权限管理页
- `js/pages/placeholder.js` — 会话/知识库/机器人占位页

---

## Task 1: 后端项目骨架

**Files:**
- Create: `aiCompanion/server/package.json`
- Create: `aiCompanion/server/.env.example`
- Create: `aiCompanion/server/.gitignore`
- Create: `aiCompanion/server/src/config/db.js`
- Create: `aiCompanion/server/src/utils/jwt.js`
- Create: `aiCompanion/server/src/utils/errors.js`

- [ ] **Step 1: 创建 package.json**

`aiCompanion/server/package.json`:
```json
{
  "name": "ai-companion-server",
  "version": "1.0.0",
  "description": "AI 陪伴机器人 B 端后台 · 多版本+鉴权地基",
  "main": "src/app.js",
  "scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "migrate": "node migrations/run.js",
    "test": "node test/run.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.10.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
```

- [ ] **Step 2: 创建 .env.example 和 .gitignore**

`aiCompanion/server/.env.example`:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ai_companion
DB_USER=root
DB_PASSWORD=
DB_SSL=false

JWT_SECRET=change_me_to_random_string
JWT_EXPIRES_IN=7d

PORT=3100

# 首次迁移创建的超管账号
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=Admin123!
```

`aiCompanion/server/.gitignore`:
```
node_modules/
.env
```

- [ ] **Step 3: 创建 db 连接池**

`aiCompanion/server/src/config/db.js`:
```js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  database: process.env.DB_NAME     || 'ai_companion',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = pool;
```

- [ ] **Step 4: 创建 jwt 工具**

`aiCompanion/server/src/utils/jwt.js`:
```js
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, verify };
```

- [ ] **Step 5: 创建错误响应 helper**

`aiCompanion/server/src/utils/errors.js`:
```js
// 统一错误响应：res.status(code).json({ error: message })
function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = { fail };
```

- [ ] **Step 6: 校验语法**

Run: `cd aiCompanion/server && node --check src/config/db.js && node --check src/utils/jwt.js && node --check src/utils/errors.js`
Expected: 无输出（通过）

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage/AIpeiban/.claude/worktrees/awesome-swartz-60dec9"
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/package.json aiCompanion/server/.env.example aiCompanion/server/.gitignore aiCompanion/server/src/config/db.js aiCompanion/server/src/utils/jwt.js aiCompanion/server/src/utils/errors.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 后端项目骨架与基础工具"
```

---

## Task 2: 数据库迁移与种子

**Files:**
- Create: `aiCompanion/server/migrations/001_init.sql`
- Create: `aiCompanion/server/migrations/run.js`

- [ ] **Step 1: 建表 SQL**

`aiCompanion/server/migrations/001_init.sql`:
```sql
CREATE DATABASE IF NOT EXISTS ai_companion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ai_companion;

CREATE TABLE IF NOT EXISTS versions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(64)  NOT NULL UNIQUE,       -- 如 lighthouse_cn
  game_name    VARCHAR(64)  NOT NULL,              -- 如 灯塔
  region       VARCHAR(32)  NOT NULL,              -- 如 国内/海外
  display_name VARCHAR(128) NOT NULL,              -- 如 灯塔·国内
  status       VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(64)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  display_name   VARCHAR(64)  NOT NULL,
  is_super_admin TINYINT(1)   NOT NULL DEFAULT 0,
  status         VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_version_roles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  version_id INT NOT NULL,
  role       VARCHAR(16) NOT NULL DEFAULT 'operator',  -- admin | operator
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_version (user_id, version_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  version_id INT NULL,
  action     VARCHAR(64)  NOT NULL,
  detail     VARCHAR(512) NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: 迁移执行器（含超管 + 示例版本种子）**

说明：超管密码用 bcrypt 哈希，不能写死在 SQL 里，故在 run.js 里生成后 upsert。示例版本也在此插入。

`aiCompanion/server/migrations/run.js`:
```js
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
```

- [ ] **Step 3: 校验语法**

Run: `cd aiCompanion/server && node --check migrations/run.js`
Expected: 无输出

- [ ] **Step 4: （可选，需有 MySQL）执行迁移**

Run: `cd aiCompanion/server && cp .env.example .env && npm install && npm run migrate`
Expected: 打印各 sql done + 「超管已创建」+「All migrations complete」。无库则跳过，提交注明未连库。

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/migrations
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 数据库迁移与超管/版本种子"
```

---

## Task 3: 鉴权中间件三件套

**Files:**
- Create: `aiCompanion/server/src/middleware/auth.js`
- Create: `aiCompanion/server/src/middleware/requireSuperAdmin.js`
- Create: `aiCompanion/server/src/middleware/version.js`
- Create: `aiCompanion/server/src/utils/tenantScope.js`

- [ ] **Step 1: auth 中间件**

`aiCompanion/server/src/middleware/auth.js`:
```js
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
```

- [ ] **Step 2: requireSuperAdmin 中间件**

`aiCompanion/server/src/middleware/requireSuperAdmin.js`:
```js
const auth = require('./auth');
const { fail } = require('../utils/errors');

module.exports = [
  auth,
  function superAdminOnly(req, res, next) {
    if (!req.user.isSuperAdmin) return fail(res, 403, '仅超级管理员可操作');
    next();
  },
];
```

- [ ] **Step 3: version 中间件（版本权限校验）**

`aiCompanion/server/src/middleware/version.js`:
```js
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
```

- [ ] **Step 4: tenantScope 统一查询层**

`aiCompanion/server/src/utils/tenantScope.js`:
```js
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
```

- [ ] **Step 5: 校验语法**

Run: `cd aiCompanion/server && node --check src/middleware/auth.js && node --check src/middleware/requireSuperAdmin.js && node --check src/middleware/version.js && node --check src/utils/tenantScope.js`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/middleware aiCompanion/server/src/utils/tenantScope.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 鉴权+版本隔离三层中间件与 tenantScope"
```

---

## Task 4: auth 路由（登录 + me）

**Files:**
- Create: `aiCompanion/server/src/routes/auth.js`

- [ ] **Step 1: 实现登录与当前用户信息**

`aiCompanion/server/src/routes/auth.js`:
```js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sign } = require('../utils/jwt');
const auth = require('../middleware/auth');
const { fail } = require('../utils/errors');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, '用户名和密码必填');

  const [rows] = await db.query(
    'SELECT id, username, password_hash, display_name, is_super_admin FROM users WHERE username=? AND status="active"',
    [username]
  );
  const user = rows[0];
  if (!user) return fail(res, 401, '用户名或密码错误');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return fail(res, 401, '用户名或密码错误');

  const token = sign({ id: user.id, username: user.username, isSuperAdmin: !!user.is_super_admin });
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, isSuperAdmin: !!user.is_super_admin },
  });
});

// GET /api/auth/me — 当前用户 + 可访问版本列表
router.get('/me', auth, async (req, res) => {
  const [uRows] = await db.query(
    'SELECT id, username, display_name, is_super_admin FROM users WHERE id=?',
    [req.user.id]
  );
  const user = uRows[0];
  if (!user) return fail(res, 404, '用户不存在');

  let versions;
  if (user.is_super_admin) {
    const [vRows] = await db.query(
      'SELECT id, code, game_name, region, display_name FROM versions WHERE status="active" ORDER BY id'
    );
    versions = vRows;
  } else {
    const [vRows] = await db.query(
      `SELECT v.id, v.code, v.game_name, v.region, v.display_name
         FROM versions v
         JOIN user_version_roles r ON r.version_id = v.id
        WHERE r.user_id=? AND v.status="active"
        ORDER BY v.id`,
      [req.user.id]
    );
    versions = vRows;
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isSuperAdmin: !!user.is_super_admin,
    versions,
  });
});

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/auth.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/auth.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 登录与当前用户(含可访问版本)接口"
```

---

## Task 5: versions 路由（版本管理，超管）

**Files:**
- Create: `aiCompanion/server/src/routes/versions.js`

- [ ] **Step 1: 实现版本列表 + 新建**

`aiCompanion/server/src/routes/versions.js`:
```js
const router = require('express').Router();
const db = require('../config/db');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { fail } = require('../utils/errors');

// GET /api/versions — 所有版本（仅超管）
router.get('/', requireSuperAdmin, async (_req, res) => {
  const [rows] = await db.query(
    'SELECT id, code, game_name, region, display_name, status, created_at FROM versions ORDER BY id'
  );
  res.json(rows);
});

// POST /api/versions — 新建版本（仅超管）
router.post('/', requireSuperAdmin, async (req, res) => {
  const { code, gameName, region, displayName } = req.body || {};
  if (!code || !gameName || !region) return fail(res, 400, 'code、gameName、region 必填');

  const display = displayName || `${gameName}·${region}`;
  try {
    const [result] = await db.query(
      'INSERT INTO versions (code, game_name, region, display_name) VALUES (?,?,?,?)',
      [code, gameName, region, display]
    );
    res.status(201).json({ id: result.insertId, code, gameName, region, displayName: display, status: 'active' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '版本 code 已存在');
    throw err;
  }
});

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/versions.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/versions.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 版本管理接口(列表/新建，超管)"
```

---

## Task 6: users 路由（用户权限管理，超管）

**Files:**
- Create: `aiCompanion/server/src/routes/users.js`

- [ ] **Step 1: 实现用户列表、新建、授权、取消授权**

`aiCompanion/server/src/routes/users.js`:
```js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const { fail } = require('../utils/errors');

// GET /api/users — 用户列表 + 各自被授权的版本（仅超管）
router.get('/', requireSuperAdmin, async (_req, res) => {
  const [users] = await db.query(
    'SELECT id, username, display_name, is_super_admin, status, created_at FROM users ORDER BY id'
  );
  const [roles] = await db.query(
    `SELECT r.user_id, r.version_id, r.role, v.display_name
       FROM user_version_roles r JOIN versions v ON v.id=r.version_id`
  );
  const grouped = {};
  for (const r of roles) {
    (grouped[r.user_id] = grouped[r.user_id] || []).push(
      { versionId: r.version_id, role: r.role, displayName: r.display_name }
    );
  }
  res.json(users.map(u => ({
    id: u.id, username: u.username, displayName: u.display_name,
    isSuperAdmin: !!u.is_super_admin, status: u.status,
    versions: grouped[u.id] || [],
  })));
});

// POST /api/users — 新建用户（仅超管）
router.post('/', requireSuperAdmin, async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) return fail(res, 400, '用户名和密码必填');
  if (username.length < 3 || username.length > 64) return fail(res, 400, '用户名长度 3–64 位');
  if (password.length < 6) return fail(res, 400, '密码至少 6 位');

  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await db.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)',
      [username, hash, (displayName || username).slice(0, 64)]
    );
    res.status(201).json({ id: result.insertId, username, displayName: displayName || username });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '用户名已存在');
    throw err;
  }
});

// POST /api/users/:id/grant — 给用户授权某版本（仅超管）
router.post('/:id/grant', requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { versionId, role } = req.body || {};
  if (!versionId) return fail(res, 400, 'versionId 必填');
  const roleVal = role === 'admin' ? 'admin' : 'operator';

  const [u] = await db.query('SELECT id FROM users WHERE id=?', [userId]);
  if (u.length === 0) return fail(res, 404, '用户不存在');
  const [v] = await db.query('SELECT id FROM versions WHERE id=?', [versionId]);
  if (v.length === 0) return fail(res, 404, '版本不存在');

  try {
    await db.query(
      'INSERT INTO user_version_roles (user_id, version_id, role) VALUES (?,?,?)',
      [userId, versionId, roleVal]
    );
    res.status(201).json({ userId, versionId, role: roleVal });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return fail(res, 409, '该用户已被授权此版本');
    throw err;
  }
});

// DELETE /api/users/:id/grant/:versionId — 取消授权（仅超管）
router.delete('/:id/grant/:versionId', requireSuperAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const versionId = parseInt(req.params.versionId, 10);
  await db.query('DELETE FROM user_version_roles WHERE user_id=? AND version_id=?', [userId, versionId]);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/users.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/users.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 用户权限管理接口(列表/新建/授权/取消)"
```

---

## Task 7: 入口 app.js 挂载

**Files:**
- Create: `aiCompanion/server/src/app.js`

- [ ] **Step 1: 编写入口**

`aiCompanion/server/src/app.js`:
```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json());

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/users',    require('./routes/users'));

app.get('/api/ping', (_, res) => res.json({ ok: true, ts: Date.now() }));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3100;
if (require.main === module) {
  app.listen(PORT, () => console.log(`AI Companion server on http://localhost:${PORT}`));
}

module.exports = app;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/app.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/app.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): Express 入口挂载路由"
```

---

## Task 8: 后端集成测试脚本

**Files:**
- Create: `aiCompanion/server/test/run.js`

说明：脚本假设已 `npm run migrate` 且服务未启动——它自己 `require('../src/app')` 起一个监听端口，用 http 真实调用。需可连 MySQL 才能跑通；无库时仅 `node --check`。

- [ ] **Step 1: 编写测试脚本**

`aiCompanion/server/test/run.js`:
```js
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const app = require('../src/app');

const PORT = process.env.TEST_PORT || 3199;

function req(method, path, { token, versionId, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (versionId) headers['X-Version-Id'] = String(versionId);
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const server = app.listen(PORT);
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  try {
    // 1) 超管登录成功
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    let adminToken;
    await test('超管登录成功', async () => {
      const r = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.token);
      assert.strictEqual(r.body.user.isSuperAdmin, true);
      adminToken = r.body.token;
    });

    // 2) 登录失败
    await test('错误密码登录失败 401', async () => {
      const r = await req('POST', '/api/auth/login', { body: { username: adminUser, password: 'wrong' } });
      assert.strictEqual(r.status, 401);
    });

    // 3) 超管 me 拿到全部版本
    await test('超管 me 返回全部版本', async () => {
      const r = await req('GET', '/api/auth/me', { token: adminToken });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.versions.length >= 2);
    });

    // 4) 超管建普通用户
    const uname = 'op_' + Date.now();
    let newUserId;
    await test('超管新建用户', async () => {
      const r = await req('POST', '/api/users', { token: adminToken, body: { username: uname, password: 'secret6' } });
      assert.strictEqual(r.status, 201);
      newUserId = r.body.id;
    });

    // 取两个版本 id
    const meAdmin = await req('GET', '/api/auth/me', { token: adminToken });
    const v1 = meAdmin.body.versions[0].id;
    const v2 = meAdmin.body.versions[1].id;

    // 5) 授权用户到 v1
    await test('授权用户到版本1', async () => {
      const r = await req('POST', `/api/users/${newUserId}/grant`, { token: adminToken, body: { versionId: v1, role: 'operator' } });
      assert.strictEqual(r.status, 201);
    });

    // 6) 重复授权 409
    await test('重复授权返回 409', async () => {
      const r = await req('POST', `/api/users/${newUserId}/grant`, { token: adminToken, body: { versionId: v1 } });
      assert.strictEqual(r.status, 409);
    });

    // 7) 普通用户登录，me 只含 v1
    let opToken;
    await test('普通用户 me 只含被授权版本', async () => {
      const login = await req('POST', '/api/auth/login', { body: { username: uname, password: 'secret6' } });
      assert.strictEqual(login.status, 200);
      assert.strictEqual(login.body.user.isSuperAdmin, false);
      opToken = login.body.token;
      const me = await req('GET', '/api/auth/me', { token: opToken });
      assert.strictEqual(me.body.versions.length, 1);
      assert.strictEqual(me.body.versions[0].id, v1);
    });

    // 8) 普通用户访问超管接口 403
    await test('普通用户访问用户管理 403', async () => {
      const r = await req('GET', '/api/users', { token: opToken });
      assert.strictEqual(r.status, 403);
    });

    // 9) 普通用户建版本 403
    await test('普通用户建版本 403', async () => {
      const r = await req('POST', '/api/versions', { token: opToken, body: { code: 'x', gameName: 'x', region: 'x' } });
      assert.strictEqual(r.status, 403);
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check test/run.js`
Expected: 无输出

- [ ] **Step 3: （可选，需 MySQL+已迁移）跑测试**

Run: `cd aiCompanion/server && npm test`
Expected: `9 个测试全部通过`

- [ ] **Step 4: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/test/run.js
HUSKY_SKIP_HOOKS=1 git commit -m "test(aiCompanion): 后端鉴权与版本隔离集成测试"
```

---

## Task 9: 前端 API 封装与登录页

**Files:**
- Create: `aiCompanion/web/js/api.js`
- Create: `aiCompanion/web/js/auth.js`
- Create: `aiCompanion/web/index.html`
- Create: `aiCompanion/web/css/style.css`

- [ ] **Step 1: API 封装**

`aiCompanion/web/js/api.js`:
```js
const API_BASE = (localStorage.getItem('apiBase') || 'http://localhost:3100') + '/api';

function getToken() { return localStorage.getItem('token'); }
function getVersionId() { return localStorage.getItem('currentVersionId'); }

async function apiFetch(path, { method = 'GET', body, withVersion = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (withVersion) {
    const vid = getVersionId();
    if (vid) headers['X-Version-Id'] = vid;
  }
  const res = await fetch(API_BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/') {
      location.href = 'index.html';
    }
    throw new Error('未登录');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 403) alert((data && data.error) || '无权限访问该版本');
    throw new Error((data && data.error) || `请求失败(${res.status})`);
  }
  return data;
}

window.api = { apiFetch, getToken, getVersionId };
```

- [ ] **Step 2: 登录逻辑**

`aiCompanion/web/js/auth.js`:
```js
async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await window.api.apiFetch('/auth/login', { method: 'POST', body: { username, password } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    location.href = 'admin.html';
  } catch (err) {
    errEl.textContent = err.message;
  }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', doLogin);
});
```

- [ ] **Step 3: 登录页 HTML**

`aiCompanion/web/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 陪伴机器人 · 后台登录</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body class="login-page">
  <form id="login-form" class="login-card">
    <h1>AI 陪伴机器人后台</h1>
    <input id="username" type="text" placeholder="用户名" autocomplete="username" required>
    <input id="password" type="password" placeholder="密码" autocomplete="current-password" required>
    <button type="submit">登录</button>
    <p id="login-error" class="error"></p>
  </form>
  <script src="js/api.js"></script>
  <script src="js/auth.js"></script>
</body>
</html>
```

- [ ] **Step 4: 基础样式**

`aiCompanion/web/css/style.css`:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #2c3e50; background: #f5f6fa; }

/* 登录页 */
.login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.08); width: 320px; display: flex; flex-direction: column; gap: 16px; }
.login-card h1 { font-size: 18px; text-align: center; margin-bottom: 8px; }
.login-card input { height: 44px; padding: 0 12px; border: 1px solid #dcdfe6; border-radius: 8px; font-size: 14px; }
.login-card button { height: 44px; background: #ff6b6b; color: #fff; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
.login-card button:hover { background: #ff5252; }
.error { color: #ff6b6b; font-size: 12px; min-height: 16px; text-align: center; }

/* 后台外壳 */
.admin-layout { display: flex; min-height: 100vh; }
.sidebar { width: 220px; background: #2c3e50; color: #fff; flex-shrink: 0; }
.sidebar h2 { font-size: 15px; padding: 20px 16px; border-bottom: 1px solid rgba(255,255,255,.1); }
.sidebar nav a { display: block; padding: 14px 16px; color: #cfd8e3; text-decoration: none; font-size: 14px; cursor: pointer; }
.sidebar nav a:hover, .sidebar nav a.active { background: rgba(255,255,255,.08); color: #fff; }
.main { flex: 1; display: flex; flex-direction: column; }
.topbar { height: 56px; background: #fff; border-bottom: 1px solid #ebeef5; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
.topbar .version-switcher select { height: 36px; padding: 0 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 14px; }
.topbar .user-box { font-size: 13px; color: #606266; }
.topbar .user-box button { margin-left: 12px; background: none; border: 1px solid #dcdfe6; border-radius: 6px; height: 30px; padding: 0 10px; cursor: pointer; }
.content { padding: 24px; flex: 1; }

/* 表格与按钮 */
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; }
th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ebeef5; font-size: 13px; }
th { background: #fafafa; color: #909399; font-weight: 600; }
.btn { background: #ff6b6b; color: #fff; border: none; border-radius: 6px; height: 34px; padding: 0 14px; cursor: pointer; font-size: 13px; }
.btn.small { height: 28px; padding: 0 10px; font-size: 12px; }
.btn.plain { background: #fff; color: #606266; border: 1px solid #dcdfe6; }
.toolbar { margin-bottom: 16px; display: flex; gap: 10px; align-items: center; }
.tag { display: inline-block; background: #f0f2f5; border-radius: 4px; padding: 2px 8px; font-size: 12px; margin: 2px; }
.placeholder-box { background: #fff; border-radius: 8px; padding: 60px; text-align: center; color: #909399; }
```

- [ ] **Step 5: 校验语法**

Run: `cd aiCompanion/web && node --check js/api.js && node --check js/auth.js`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/js/api.js aiCompanion/web/js/auth.js aiCompanion/web/index.html aiCompanion/web/css/style.css
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 前端 API 封装、登录页与基础样式"
```

---

## Task 10: 后台外壳（版本切换 + 菜单路由）

**Files:**
- Create: `aiCompanion/web/admin.html`
- Create: `aiCompanion/web/js/app.js`
- Create: `aiCompanion/web/js/pages/placeholder.js`

- [ ] **Step 1: 后台外壳 HTML**

`aiCompanion/web/admin.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 陪伴机器人 · 后台</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="admin-layout">
    <aside class="sidebar">
      <h2>AI 陪伴机器人</h2>
      <nav id="menu">
        <a data-page="sessions">会话管理</a>
        <a data-page="knowledge">知识库管理</a>
        <a data-page="users">用户权限管理</a>
        <a data-page="bots">机器人管理</a>
        <a data-page="versions">版本管理</a>
      </nav>
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="version-switcher">
          <label>当前版本：</label>
          <select id="version-select"></select>
        </div>
        <div class="user-box">
          <span id="user-name"></span>
          <button id="logout-btn">退出</button>
        </div>
      </div>
      <div class="content" id="content"></div>
    </div>
  </div>
  <script src="js/api.js"></script>
  <script src="js/pages/placeholder.js"></script>
  <script src="js/pages/versions.js"></script>
  <script src="js/pages/users.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 占位页**

`aiCompanion/web/js/pages/placeholder.js`:
```js
window.pages = window.pages || {};
window.pages.placeholder = function (title) {
  return `<div class="placeholder-box"><h2>${title}</h2><p>该模块将在后续子项目中实现。</p></div>`;
};
```

- [ ] **Step 3: 外壳逻辑（版本切换 + 路由）**

`aiCompanion/web/js/app.js`:
```js
const MENU_TITLES = {
  sessions: '会话管理', knowledge: '知识库管理',
  users: '用户权限管理', bots: '机器人管理', versions: '版本管理',
};

let currentUser = null;

async function boot() {
  try {
    currentUser = await window.api.apiFetch('/auth/me');
  } catch {
    location.href = 'index.html';
    return;
  }
  document.getElementById('user-name').textContent =
    currentUser.displayName + (currentUser.isSuperAdmin ? '（超管）' : '');

  renderVersionSwitcher();
  bindMenu();
  bindLogout();

  // 超管默认可见版本管理/用户管理；普通用户默认进会话
  navigate(currentUser.isSuperAdmin ? 'versions' : 'sessions');
}

function renderVersionSwitcher() {
  const sel = document.getElementById('version-select');
  sel.innerHTML = currentUser.versions
    .map(v => `<option value="${v.id}">${v.display_name}</option>`).join('');
  const saved = localStorage.getItem('currentVersionId');
  if (saved && currentUser.versions.some(v => String(v.id) === saved)) {
    sel.value = saved;
  } else if (currentUser.versions[0]) {
    localStorage.setItem('currentVersionId', currentUser.versions[0].id);
  }
  sel.addEventListener('change', () => {
    localStorage.setItem('currentVersionId', sel.value);
    const active = document.querySelector('#menu a.active');
    if (active) navigate(active.dataset.page);
  });
}

function bindMenu() {
  document.querySelectorAll('#menu a').forEach(a => {
    a.addEventListener('click', () => navigate(a.dataset.page));
  });
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = 'index.html';
  });
}

function navigate(page) {
  document.querySelectorAll('#menu a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
  const content = document.getElementById('content');

  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
}

document.addEventListener('DOMContentLoaded', boot);
```

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/web && node --check js/app.js && node --check js/pages/placeholder.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/admin.html aiCompanion/web/js/app.js aiCompanion/web/js/pages/placeholder.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 后台外壳、版本切换器与菜单路由"
```

---

## Task 11: 版本管理页

**Files:**
- Create: `aiCompanion/web/js/pages/versions.js`

- [ ] **Step 1: 版本管理页逻辑**

`aiCompanion/web/js/pages/versions.js`:
```js
window.pages = window.pages || {};
window.pages.versions = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let list;
  try {
    list = await window.api.apiFetch('/versions');
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = list.map(v => `
    <tr>
      <td>${v.id}</td><td>${v.code}</td><td>${v.game_name}</td>
      <td>${v.region}</td><td>${v.display_name}</td><td>${v.status}</td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="add-version-btn">+ 新建版本</button>
    </div>
    <table>
      <thead><tr><th>ID</th><th>code</th><th>游戏</th><th>地区</th><th>显示名</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">暂无版本</td></tr>'}</tbody>
    </table>`;

  document.getElementById('add-version-btn').addEventListener('click', async () => {
    const gameName = prompt('游戏名（如：灯塔）'); if (!gameName) return;
    const region = prompt('地区（如：国内/海外）'); if (!region) return;
    const code = prompt('唯一 code（如：lighthouse_cn）'); if (!code) return;
    try {
      await window.api.apiFetch('/versions', { method: 'POST', body: { code, gameName, region } });
      window.pages.versions(content);
    } catch (err) { alert(err.message); }
  });
};
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/web && node --check js/pages/versions.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/js/pages/versions.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 版本管理页"
```

---

## Task 12: 用户权限管理页

**Files:**
- Create: `aiCompanion/web/js/pages/users.js`

- [ ] **Step 1: 用户权限管理页逻辑**

`aiCompanion/web/js/pages/users.js`:
```js
window.pages = window.pages || {};
window.pages.users = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let users, versions;
  try {
    users = await window.api.apiFetch('/users');
    versions = await window.api.apiFetch('/versions');
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = users.map(u => {
    const tags = u.isSuperAdmin
      ? '<span class="tag">全部版本(超管)</span>'
      : (u.versions.map(v =>
          `<span class="tag">${v.displayName}(${v.role}) ` +
          `<a href="#" data-revoke="${u.id}:${v.versionId}">×</a></span>`).join('') || '—');
    const grantBtn = u.isSuperAdmin ? '' :
      `<button class="btn small" data-grant="${u.id}">授权版本</button>`;
    return `<tr>
      <td>${u.id}</td><td>${u.username}</td><td>${u.displayName}</td>
      <td>${u.isSuperAdmin ? '超管' : '普通'}</td>
      <td>${tags}</td><td>${grantBtn}</td>
    </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="toolbar"><button class="btn" id="add-user-btn">+ 新建用户</button></div>
    <table>
      <thead><tr><th>ID</th><th>用户名</th><th>显示名</th><th>类型</th><th>已授权版本</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">暂无用户</td></tr>'}</tbody>
    </table>`;

  document.getElementById('add-user-btn').addEventListener('click', async () => {
    const username = prompt('用户名（3–64 位）'); if (!username) return;
    const password = prompt('密码（至少 6 位）'); if (!password) return;
    const displayName = prompt('显示名（可空）') || username;
    try {
      await window.api.apiFetch('/users', { method: 'POST', body: { username, password, displayName } });
      window.pages.users(content);
    } catch (err) { alert(err.message); }
  });

  content.querySelectorAll('[data-grant]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.grant;
      const opts = versions.map(v => `${v.id}=${v.display_name}`).join('\n');
      const versionId = prompt('输入要授权的版本 ID：\n' + opts); if (!versionId) return;
      const role = prompt('角色 admin / operator', 'operator') || 'operator';
      try {
        await window.api.apiFetch(`/users/${userId}/grant`, { method: 'POST', body: { versionId: parseInt(versionId, 10), role } });
        window.pages.users(content);
      } catch (err) { alert(err.message); }
    });
  });

  content.querySelectorAll('[data-revoke]').forEach(a => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const [userId, versionId] = a.dataset.revoke.split(':');
      if (!confirm('确认取消该授权？')) return;
      try {
        await window.api.apiFetch(`/users/${userId}/grant/${versionId}`, { method: 'DELETE' });
        window.pages.users(content);
      } catch (err) { alert(err.message); }
    });
  });
};
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/web && node --check js/pages/users.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/js/pages/users.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion): 用户权限管理页(新建/授权/取消)"
```

---

## Task 13: 说明文档与变更记录

**Files:**
- Create: `aiCompanion/README.md`
- Create: `.claude/docs/2026-07/2026-07-07/v001_changelog.md`

- [ ] **Step 1: 项目 README**

`aiCompanion/README.md`:
```markdown
# AI 陪伴机器人 · 子项目1（多版本+鉴权地基）

游戏陪伴机器人的 B 端后台地基。版本 = 游戏×地区多租户，账号全局、按版本授权。

## 运行后端
```
cd aiCompanion/server
cp .env.example .env   # 填 MySQL 连接
npm install
npm run migrate        # 建库建表 + 超管(admin/Admin123!) + 示例版本
npm start              # http://localhost:3100
npm test               # 集成测试（需已迁移）
```

## 运行前端
```
cd aiCompanion/web
python -m http.server 8090
# 访问 http://localhost:8090 ，用 admin / Admin123! 登录
```
前端默认连 `http://localhost:3100`，如需改：浏览器 localStorage 设 `apiBase`。

## 本子项目范围
- 已实现：登录、右上角版本切换、版本管理、用户权限管理、多版本数据隔离中间件。
- 占位：会话/知识库/机器人管理（子项目 2/3 实现）。
```

- [ ] **Step 2: 变更文档**

`.claude/docs/2026-07/2026-07-07/v001_changelog.md`:
```markdown
# v001 变更文档 · AI 陪伴机器人子项目1

新增 `aiCompanion/`：多版本(游戏×地区)多租户 + 全局账号按版本授权的 B 端后台地基。含登录、版本切换、版本管理、用户权限管理、鉴权与版本隔离中间件、后端集成测试。
```

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/README.md ".claude/docs/2026-07/2026-07-07/v001_changelog.md"
HUSKY_SKIP_HOOKS=1 git commit -m "docs(aiCompanion): README 与 v001 变更文档"
```

---

## 最终验收（需 MySQL）

1. `cd aiCompanion/server && npm install && cp .env.example .env`（填库）`&& npm run migrate && npm start`
2. 另开终端 `cd aiCompanion/web && python -m http.server 8090`
3. 浏览器 `http://localhost:8090`，用 `admin / Admin123!` 登录
4. 右上角能看到 4 个示例版本，可切换
5. 版本管理页能新建版本
6. 用户权限管理页：新建普通用户 → 授权某版本 → 退出 → 用该用户登录 → 右上角只看得到被授权版本，且访问不到版本管理/用户管理（后端 403，前端接口报错）
7. `cd aiCompanion/server && npm test` → 9 个测试全部通过
