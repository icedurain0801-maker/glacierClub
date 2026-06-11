# v001 变更文档 —— worldCupBetting 生产配置改造（腾讯云云数据库 MySQL）

## 背景
worldCupBetting-server 是一套真实可运行的 Express + MySQL 后端，但此前所有地址均写死 `localhost`，仅能本机运行。本次按「1B 改生产配置 + 2B 腾讯云云数据库 MySQL」方案，将代码改造为可部署状态。

## 变更内容

### 前端（worldCupBetting）
- 新增 `js/config.js`：统一 API 地址配置（`window.WC_CONFIG.API_BASE`），部署时只改这一处
- `js/api.js`、`admin/_layout.js`、`admin/index.html`：3 处写死的 `http://localhost:3000/api` 改为读取 `WC_CONFIG`，回退值保留 localhost
- 在 `index.html` 及 3 个 admin 页面（dashboard/users/matches）`<script>` 引入链最前面加载 `config.js`

### 后端（worldCupBetting-server）
- `src/config/db.js`：新增 `DB_SSL` 开关，为 true 时启用 SSL（腾讯云云数据库外网连接需要）
- `.env.example` / `.env`：改为腾讯云云数据库 MySQL 模板，新增 `DB_HOST/DB_PORT/DB_SSL` 等占位项，更换默认 `JWT_SECRET`

## 你还需要手动做的事（按顺序）
1. 腾讯云控制台开通「云数据库 MySQL」实例，记下：实例地址、端口、账号、密码
2. 把真实值填入 `worldCupBetting-server/.env`（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD）
3. 数据库安全组/白名单放行你的访问来源（CVM 内网 IP 或你的公网 IP）
4. 服务器执行 `npm install` → `npm run migrate` → `npm start`（建议 pm2 常驻）
5. 把 `js/config.js` 里的 `API_BASE` 改成后端公网地址（如 `http://公网IP:3000/api`）
6. CVM 安全组放行后端端口（默认 3000）

## 注意
- `.env` 含密码，切勿提交到公共仓库
- 外网连云数据库 → `DB_SSL=true`；同 VPC 内网连接 → `DB_SSL=false`
