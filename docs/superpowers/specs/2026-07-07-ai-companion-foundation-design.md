# AI 陪伴机器人 · 子项目 1：多版本 + 鉴权地基 设计文档

日期：2026-07-07
状态：已通过设计评审，待用户 review

## 背景与整体拆分

需求为「AI 游戏陪伴机器人」，含 C 端对话机器人与 B 端管理后台（会话管理、知识库管理、用户权限管理、机器人管理）。B 端右上角按「版本」区分，每个版本的管理相互独立；知识库为 RAG + 知识图谱聚合，支持上传 Excel 自动整合、支持 1G 文件上传。

该需求涉及多个相互独立的子系统，一次性做完既慢又易乱，故拆为三个子项目，按依赖顺序推进，每个子项目独立走 spec → plan → 实现：

| # | 子项目 | 核心内容 | 依赖 |
|---|--------|----------|------|
| 1 | 多版本 + 鉴权地基（**本文档**） | B 端后台外壳、右上角版本切换、用户/权限管理、多版本数据隔离 | 无 |
| 2 | 知识库摄取 | Excel 上传（1G 分片）、解析入库、RAG 向量化 + 知识图谱抽取聚合 | 1 |
| 3 | 机器人 + 会话管理 | B 端机器人配置、会话管理；C 端对话机器人（大模型 + 检索子项目 2 知识库） | 1、2 |

### 已确认的关键决策（来自 brainstorming）

- **项目性质**：全栈可运行产品（非纯前端原型）。
- **基础设施选型**：轻量云 API 方案。大模型走云 API（OpenAI/通义/智谱等），向量库用轻量方案（pgvector/Chroma），知识图谱先存 MySQL。这些在子项目 2/3 落地，本子项目不涉及。
- **「版本」的含义**：游戏维度的多租户隔离，粒度为「游戏 × 地区」，例如「灯塔·国内」「灯塔·海外」「超能世界·国内」「超能世界·海外」。每个版本的会话/知识库/用户/机器人完全独立。版本会不断新增。
- **账号与版本关系**：账号全局，按版本授权（用户 × 版本 多对多）。标准 RBAC + 多租户。
- **数据隔离方案**：方案 A —— 共享表 + `version_id` 列，通过统一查询层强制注入过滤条件。（否决方案 B「每版本独立库」，因版本会不断新增，建库/迁移/跨版本统计成本高。）
- **子项目 1 技术栈**：后端 Express + MySQL + JWT（对齐现有 `worldCupBetting-server`）；前端后台用原生 HTML/CSS/JS（对齐仓库其他原型）。

## 范围（本子项目做什么 / 不做什么）

**做：**
- 后端鉴权骨架：登录/登出、JWT、当前用户信息 + 可访问版本列表。
- 版本（游戏）管理：列表、新建（仅超管）。
- 用户权限管理：用户列表、新建用户、用户 × 版本授权（仅超管）。
- 多版本数据隔离机制：三层中间件 + 统一查询层（tenantScope），供后续子项目复用。
- 后台外壳：左侧菜单（含全部 5 个模块入口）、右上角版本切换器。
- 数据库迁移 + 种子数据（超管账号 + 示例版本）。

**不做（留给子项目 2/3）：**
- 会话管理、知识库管理、机器人管理三个模块只放**占位页**，不实现真实功能。
- 版本内角色仅预留 `admin`/`operator` 两种，暂不细分权限点。
- 无 C 端。

## 目录结构

新建独立目录 `aiCompanion/`（与 `worldCupBetting` 平级）：

```
aiCompanion/
  server/                   # Express + MySQL + JWT，风格对齐 worldCupBetting-server
    src/
      app.js                # 入口，挂载路由
      db.js                 # mysql2 连接池
      middleware/
        auth.js             # 校验 JWT，挂 req.user
        version.js          # 解析当前版本 + 校验用户对该版本有权限，挂 req.versionId
        tenantScope.js      # 统一查询封装：所有业务查询强制注入 version_id
      routes/
        auth.js             # 登录/登出/当前用户信息
        versions.js         # 版本(游戏)列表、新建版本（超管）
        users.js            # 用户管理 + 用户×版本授权（超管）
      services/
    migrations/
      001_init.sql          # 建表
      002_seed.sql          # 种子：超管账号 + 示例版本
      run.js
    .env.example
    package.json
  web/                      # 原生 HTML/CSS/JS 后台
    index.html              # 登录页
    admin.html              # 后台外壳（左侧菜单 + 右上角版本切换器）
    css/style.css
    js/
      api.js                # fetch 封装，自动带 token + 当前 version
      auth.js               # 登录逻辑
      app.js                # 后台外壳、版本切换、路由到各管理页
      pages/
        users.js            # 用户权限管理页
        versions.js         # 版本管理页
        placeholder.js      # 会话/知识库/机器人管理的占位页（子项目2/3再填）
```

后台左侧菜单先放全 5 个模块入口（会话管理、知识库管理、用户权限管理、机器人管理、版本管理），本子项目只实现「用户权限管理」「版本管理」两页，其余为占位页。

## 数据模型

```
versions                        游戏版本(租户)
  id, code, game_name, region,  -- code 如 lighthouse_cn；region 如 国内/海外
  display_name, status, created_at
  -- 例: (lighthouse_cn, 灯塔, 国内, "灯塔·国内")

users                           全局账号
  id, username, password_hash,  -- bcrypt
  display_name, is_super_admin,  -- 超管标志，超管自动拥有所有版本
  status, created_at

user_version_roles              用户×版本 授权 (多对多)
  id, user_id, version_id,
  role,                         -- 'admin' | 'operator'（版本内角色，先两种）
  created_at
  UNIQUE(user_id, version_id)

audit_logs (先建表，可选使用)    关键操作审计
  id, user_id, version_id, action, detail, created_at
```

关键决策：
1. **超管**：`is_super_admin=1` 的账号不写 `user_version_roles`，代码直接放行所有版本；只有超管能建版本、建用户、授权。
2. **版本内角色**先只 `admin`/`operator` 两种，占位；子项目 2/3 需要时再扩权限点。
3. **业务表 version_id 约定**：本子项目无业务表，但后续所有业务表（会话/知识库/机器人等）**必须**带 `version_id`，且**必须**经 tenantScope 查询层。此为强制约定。
4. 密码用 bcrypt，对齐现有 server。

## 鉴权与版本隔离机制

**登录流程**
1. `POST /api/auth/login` 校验 username/password → 签发 JWT（含 `user_id`、`is_super_admin`）。
2. 前端存 token，后续请求头带 `Authorization: Bearer <token>`。
3. `GET /api/auth/me` 返回用户信息 + 该用户可访问版本列表（超管=全部；普通用户=授权表）。

**版本切换（右上角）**
- 前端从 `/api/auth/me` 拿版本列表渲染右上角下拉；选中存 `localStorage.currentVersion`。
- 之后每个业务请求带 `X-Version-Id` 请求头（`api.js` 统一注入）。

**三层中间件（请求依次经过）**
1. `auth.js` — 校验 JWT，挂 `req.user`；失败 → 401。
2. `version.js` — 读 `X-Version-Id`，校验该用户对此版本有权限（超管放行 / 普通用户查授权表），挂 `req.versionId`；失败 → 403。
3. `tenantScope.js` — 提供统一查询 helper，业务查询必须经它，自动拼 `WHERE version_id = req.versionId`，写入自动带 `version_id`。

**关键安全点**：版本权限校验在**后端中间件**做，不信任前端传的版本；即便前端伪造 `X-Version-Id`，后端查授权表拦截。用户管理/版本管理等超管接口额外加 `requireSuperAdmin`。

## 错误处理

- 统一 JSON 错误格式：`{ error: { code, message } }`。
- 状态码：401（未登录/token 失效）、403（无版本权限或非超管）、400（参数错误）、404（资源不存在）、409（冲突，如重复授权、版本 code 重复）。
- 前端 `api.js` 统一拦截：401 → 跳回登录页；403 → 提示「无权限访问该版本」。

## 测试策略

跟仓库风格一致，轻量为主：
- **后端**：`test/` 脚本，用 Node 内置断言 + 真实 HTTP 调用，覆盖关键路径：
  - 登录成功/失败；
  - 普通用户只能拿到授权版本、访问未授权版本被 403；
  - 超管能建版本、建用户、授权；
  - **隔离验证**：同一接口带不同 `X-Version-Id` 返回各自版本数据，不串。
- **前端**：`node --check` 语法校验（对齐 worldCupBetting 原型，无浏览器自动化测试）。
- **迁移**：`migrations/run.js` + 种子数据，`npm run migrate` 一键建库。

## 验收标准

能真登录 → 右上角切换「灯塔·国内 / 灯塔·海外」→ 用户管理页给某账号授权某版本 → 该账号登录后只看得到被授权版本。

## 后续子项目衔接约定

- 所有新业务表必带 `version_id`，查询必经 tenantScope 层。
- 左侧菜单占位页（会话/知识库/机器人管理）由子项目 2/3 填充。
- 基础设施（大模型云 API、向量库、知识图谱）在子项目 2/3 引入，本子项目不预置依赖。
