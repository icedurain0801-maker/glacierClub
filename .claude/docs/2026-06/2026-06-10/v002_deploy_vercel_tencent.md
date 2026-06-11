# v002 部署手册 —— 前端 Vercel + 后端腾讯云

## 架构

```
手机浏览器 ──https──► Vercel（托管前端静态页 + /api 反向代理）
                         │  /api/* 服务端转发（不经过浏览器）
                         ▼
                  腾讯云 CVM：Node 后端 http://公网IP:3000
                         │
                         ▼
                  腾讯云 云数据库 MySQL
```

**为什么这样分**：Vercel 是 serverless，不适合常驻 Express + MySQL 连接池，所以后端留腾讯云常驻跑。前端用 Vercel 的 rewrites 反代 `/api`，浏览器全程只跟 Vercel 的 HTTPS 同源通信 → 跨域 / 混合内容问题全部消失，后端因此**无需域名、无需备案、无需 HTTPS**。

---

## 一、后端部署（腾讯云 CVM）

> 假设系统为 Ubuntu/CentOS，已能 SSH 登录。

### 1. 装 Node（推荐 18+）
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs        # CentOS 用 yum
node -v
```

### 2. 上传后端代码
把 `worldCupBetting-server` 整个目录传到服务器（scp / git clone 均可），例如 `/opt/wc-server`。
**注意：不要传 node_modules**，到服务器上重新装。

### 3. 配置云数据库
1. 腾讯云控制台 → 云数据库 MySQL → 开通实例，记下：内网地址、端口、账号、密码
2. 因为后端和数据库都在腾讯云，**优先用内网地址**（更快、免 SSL）
3. 数据库安全组/白名单放行 CVM 的内网 IP

### 4. 填 .env
编辑 `/opt/wc-server/.env`：
```ini
DB_HOST=内网地址           # 内网地址
DB_PORT=实例端口
DB_NAME=wc2026_betting
DB_USER=数据库账号
DB_PASSWORD=数据库密码
DB_SSL=false               # 内网连接关 SSL；若用外网地址则改 true

JWT_SECRET=换成你自己的随机串
JWT_EXPIRES_IN=7d
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=改个强密码
```

### 5. 装依赖 + 建库建表 + 启动
```bash
cd /opt/wc-server
npm install
npm run migrate        # 建表 + 写入种子赛程数据
sudo npm i -g pm2
pm2 start src/app.js --name wc-server
pm2 save && pm2 startup   # 开机自启
```

### 6. CVM 安全组放行 3000 端口
腾讯云控制台 → 该 CVM → 安全组 → 入站规则 → 放行 TCP:3000（来源 0.0.0.0/0）。

### 7. 验证
浏览器访问 `http://你的公网IP:3000/api/ping`，返回 `{"ok":true,...}` 即后端就绪。

---

## 二、前端部署（Vercel）

### 1. 改 vercel.json
编辑 `worldCupBetting/vercel.json`，把占位符换成真实公网 IP：
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "http://你的腾讯云公网IP:3000/api/:path*" }
  ]
}
```

### 2. 部署
- 方式 A（推荐）：把 `worldCupBetting` 目录推到 GitHub，在 vercel.com 导入该仓库，**Root Directory 设为 worldCupBetting**，Framework 选 Other，直接 Deploy
- 方式 B：本地装 `npm i -g vercel`，在 `worldCupBetting` 目录跑 `vercel --prod`

### 3. 访问
- 用户端：`https://你的项目.vercel.app/`
- 管理后台：`https://你的项目.vercel.app/admin/`
- 管理员账号：`.env` 里的 ADMIN_USERNAME / ADMIN_PASSWORD

---

## 三、上线后自检清单
- [ ] `http://公网IP:3000/api/ping` 正常
- [ ] Vercel 首页能打开
- [ ] 注册/登录正常（说明 /api 反代通了）
- [ ] 赛程列表有数据（说明 migrate 的种子数据写进去了）
- [ ] admin 后台能登录、能管理赛程

## 安全提醒
- `.env` 含密码，勿提交公共仓库
- 上线前务必改掉默认 `JWT_SECRET` 和 `ADMIN_PASSWORD`
- 后端 3000 端口直接暴露公网，建议后续给数据库账号最小权限
