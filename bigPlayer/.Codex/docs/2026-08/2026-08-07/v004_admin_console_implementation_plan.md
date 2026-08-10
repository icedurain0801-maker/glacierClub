# 舆情后台控制台重设计 · 实施计划

- 文档版本：v004
- 日期：2026-08-07
- 依据：v003 后台重设计文档（decision D1-D5）
- 目标：把「阶段 A/B/C」拆成逐个可执行、可独立验证的任务
- 交付前提：易迁移（沿用现有 po_ 表、mysql2、原生前端、`{data,meta}`/`{error}` 契约）

---

## 现状核对（写计划前已确认）

- Repository 已有：listGames/listSources/listEnabledSources/getOverview/listContents/listAlerts/getAlert/updateAlert/createRun/finishRun/insertContent/insertAnalysis/listDueSources/getCredential/updateSourceAuth/updateCredentialCheck/loadKeywordRules/countWindowHits/findOpenAlert/insertAlert/linkAlertContent/updateDingStatus。
- app.js 只读接口：GET /games、/sources、/overview、/contents、/alerts；PATCH /alerts/:id。**写接口全缺**。
- `po_keyword_rules.severity` CHECK 仅允许 `attention`/`urgent`（normal 属未命中内容默认，非关键词等级）→ 页⑤严重等级下拉只给这两档。
- `po_keyword_rules` 唯一键已是 `(game_id, platform, keyword)`，游戏级默认 platform=NULL 可与平台级并存。
- `po_credentials` 现有列：secret_ref/status/last_checked_at/expire_at/failure_reason，**无密文列** → 需 003 迁移加 `secret_cipher`。
- migrate.js 自动批量执行 `public-opinion-system/migrations/*.sql` 并按 po_schema_migrations 去重 → 加 `003_*.sql` 即可，幂等。
- admin/ 下已有多模块多页习惯（analytics/community/content-governance/official-website）→ 页④页⑤各自独立 HTML 入口，符合现状。

---

## 阶段 A · 后端写接口 + 凭据加密（地基，前端依赖）

### A1. 迁移 003：po_credentials 加密列
- **文件**：新建 `public-opinion-system/migrations/003_credential_cipher.sql`
- **内容**：`ALTER TABLE po_credentials ADD COLUMN IF NOT EXISTS secret_cipher TEXT NULL;`（存 AES 密文 + iv，明文永不入库；secret_ref 保留作为「密钥库引用」兼容路径）
- **验证**：`npm run migrate` 幂等（二次执行 no-op）；`DESCRIBE po_credentials` 含 secret_cipher。

### A2. 凭据加解密工具
- **文件**：新建 `public-opinion-system/server/src/integrations/credentialCipher.js`
- **内容**：`encrypt(plain)` / `decrypt(payload)`，AES-256-GCM，密钥读 `CREDENTIAL_ENC_KEY`（环境变量，32 字节 hex/base64）；未配置抛 `CREDENTIAL_ENC_KEY_MISSING`（fail-closed，不降级明文）。输出 `{iv, tag, cipher}` 序列化存 secret_cipher。
- **安全红线**：明文只在内存，永不落库、永不日志、永不回显。
- **验证**：新单测 `credentialCipher.test.js`——encrypt→decrypt 往返一致；密钥缺失抛错；密文不含明文子串。

### A3. Repository 写方法扩展
- **文件**：`public-opinion-system/server/src/db/repository.js`
- **新增方法**：
  - `updateSource(id, patch)`：enabled/frequency_seconds/active_window(JSON) 部分更新。
  - `upsertCredential(sourceId, {secretCipher, expireAt})`：ON DUPLICATE KEY UPDATE，写密文，status='active'。
  - `replaceKeywordRules(gameId, groups[])`：**DML 事务**内先 `DELETE FROM po_keyword_rules WHERE game_id=?` 再批量 INSERT（group_name/keyword/severity/platform/trigger_mode/window_seconds/threshold_count）。原子替换。
  - `listKeywordRulesRaw(gameId)`：返回该 game 全部规则原始行（含 platform=NULL 与平台级），供前端按 group 聚合。
- **验证**：扩展 `repository.test.js`——stub query 断言 SQL 形态（事务 DELETE+INSERT、JSON active_window、密文 upsert）。

### A4. API 路由：6 个写接口
- **文件**：`public-opinion-system/server/src/app.js`
- **新增**（沿用 success/errorPayload 契约）：
  - `PATCH /sources/:id` → repo.updateSource（body: enabled/frequencySeconds/activeWindow）。
  - `PUT /sources/:id/credential` → credentialCipher.encrypt → repo.upsertCredential；响应**不含明文**，仅 {configured:true, expireAt}。
  - `POST /sources/:id/check-auth` → connector.healthCheck → repo.updateSourceAuth + updateCredentialCheck，返回 {authStatus, reason}。
  - `POST /sources/:id/collect` → 入队（见 A5），返回 {queued:true, runId?}；未授权源返回 `{error:{code:'UNAUTHORIZED'}}`（fail-closed，不伪造）。
  - `GET /keyword-rules?gameId=` → repo.listKeywordRulesRaw → 按 group_name 聚合成 groups[]。
  - `PUT /keyword-rules` → 校验(空组/重复词/阈值正整数/时间窗>0) → repo.replaceKeywordRules。
- **验证**：新单测 `app.routes.test.js`（或扩现有）——mock repo，断言各路由状态码 + 契约 + 凭据响应不回显明文 + 校验拒绝非法 body(400)。

### A5. 手动触发采集入队机制
- **文件**：`public-opinion-system/server/src/app.js` + `worker/src/worker.js`
- **方案**：最小实现——POST /collect 在 po_sources 打「立即到期」标记（如置 last_success_at=NULL 或写一张 po_collect_requests，实施时择简）；Worker 下个 tick 扫到即采。**不做同步阻塞采集**（§6.3）。二选一的具体做法在本任务内定并注释说明。
- **验证**：worker 单测——存在待处理请求时 runOnce 会 pick 该 source；未授权 source 返回 UNAUTHORIZED 不进 collect。

### A6. 环境变量与文档
- **文件**：`public-opinion-system/.env.example`
- **新增**：`CREDENTIAL_ENC_KEY=`（32 字节，注释「必填，缺失则凭据接口 fail-closed」）。
- **验证**：README/production-checklist 补一句凭据加密说明。

**阶段 A 出口**：`npm test`（server+worker）全绿；`npm run migrate` 幂等；6 接口本地 curl/node 探针通过；凭据往返加密、响应不回显。

---

## 阶段 B · 新建配置两页

### B1. 页④ 采集源与授权
- **文件**：新建 `admin/PublicOpinion/sources.html` + `admin/PublicOpinion/assets/sources.js`
- **交互**（v003 §4.4）：
  - 采集源列表，每行可展开配置区。
  - 平台开关 toggle → PATCH /sources/:id {enabled}。
  - 采集频率下拉(15/30/60/自定义分钟) → PATCH {frequencySeconds}。
  - 生效时段：星期多选 + 起止时间(支持跨天) → PATCH {activeWindow:{days,start,end}}。
  - 凭据：输入框填 Cookie/token → PUT /credential；页面只显示「已配置✓/有效期/最近校验」，**不回显明文**；「检测授权」→ POST /check-auth。
  - 「立即采集」→ POST /collect，带结果 toast。
  - 状态列：未配置/已授权/已过期/失败(附原因)。
- **验证**：接后端真实接口，浏览器操作全链路（开关/频率/时段/凭据/检测/采集）落库生效。

### B2. 页⑤ 关键词规则
- **文件**：新建 `admin/PublicOpinion/keywords.html` + `admin/PublicOpinion/assets/keywords.js`
- **交互**（v003 §4.5）：
  - 游戏选择器 → GET /keyword-rules?gameId 回填分组卡片。
  - 每组卡片：组名、触发方式(immediate/aggregate)、严重等级(attention/urgent)、关键词 chips 增删、生效平台(游戏级默认/平台级覆盖)。
  - aggregate 组显示 window_seconds + threshold_count；immediate 组隐藏。
  - 新建组/删除组、[+添加词]。
  - 「保存全部规则」→ 前端校验(空组/重复词/阈值) → PUT /keyword-rules 全量提交。
- **验证**：编辑→保存→重载回显一致；保存后 loadKeywordRules 生效、pipeline 命中分流正确（跑一条命中内容验证）。

**阶段 B 出口**：两页真实接口连通，配置落库并被 Worker/pipeline 读取生效。

---

## 阶段 C · 信息架构拆分 + 监控页打磨

### C1. 侧边栏 5 页拆分
- **文件**：`admin/PublicOpinion/index.html`（拆为监控看板）、新建 `content.html`(内容活流) + `alerts.html`(告警处置)；连同 B 的 sources.html/keywords.html 共 5 页。
- **动作**：现有 index.html 单页的「概览区」留在监控看板；「最新内容」tab → content.html；「告警处置」tab → alerts.html；「采集配置」tab 废弃(能力已进 sources.html)。侧边栏 sidebar-data 增 5 个子项。
- **验证**：5 页切换正常，各页只读接口照常。

### C2. 三个监控页视觉打磨
- **动作**（v003 §4.1-4.3）：空状态(图标+引导语)、加载态(骨架屏)、错误态(页面级+重试，区分「服务未启动」vs「无数据」)；告警抽屉补关联内容列表 + 钉钉推送状态；内容情感过滤加 unclassified；告警列表加 alert_type。
- **验证**：断网/空库/正常三态表现正确，无假按钮、无死链。

**阶段 C 出口**：v003 §9 验收 1/5/6 项达成；整站无占位假按钮。

---

## 跨阶段约束（全程遵守）

- **安全**：凭据 fail-closed（无 CREDENTIAL_ENC_KEY 拒绝写）、明文不落库/不日志/不回显；未授权平台不伪造采集数据；po_ 前缀隔离，不碰 aiCompanion 业务表。
- **契约**：成功 `{data,meta}`、失败 `{error:{code,message,details}}`、HTTP 200/400/404/500，CORS 沿用。
- **测试**：跟随现有 node:test 风格，每个后端任务配单测；前端每页接真实接口手测。
- **临时文件**：仅仓库根 `.temp/`，不在 bigPlayer/ 下。
- **收尾**：完成后按 AGENTS.md 补 changelog（`.Codex/docs/2026-08/2026-08-07/v005_*_changelog.md`）。

---

## 建议执行顺序

A1→A2→A3→A4→A5→A6（地基，全绿再动前端）→ B1→B2 → C1→C2。
每完成一个任务即验证，不攒批。
