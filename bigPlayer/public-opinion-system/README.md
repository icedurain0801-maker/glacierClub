# Public Opinion System

独立的游戏舆情监控系统工程，不依赖 `aiCompanion/server` 的代码、数据库或业务表。

## Components

- `server`: HTTP API、鉴权边界、配置管理、查询和处置接口。
- `worker`: 独立采集/分析/告警任务进程。
- `db`: MySQL/MariaDB schema and migration entry points。
- `connectors`: 平台采集契约和平台实现。
- `integrations`: 公司 AI 与钉钉的外部服务契约。
- `web`: 独立前端部署产物目录。

## Status

这是面向正式开发交接的系统骨架，不把本地 Mock 数据当作正式数据源：

- 大玩家 H5 连接器使用账号级只读 Token 动态发现授权板块，覆盖首页合并流、资讯页、玩家圈全部动态 Tab 及各自分页，并通过 `/api/club/v1/auth/comment/:postId` 同步顶层评论和分页回复。同一帖子跨入口去重但保留 feed 归属；任一 feed、评论或回复未完成时不得声明 `completed_full`。Q1 feed 不支持可靠发布时间参数时依赖分页 checkpoint 续抓，daily 任务不会从头全量扫描；评论刷新也有父帖和页数预算。历史内部 Provider API 和旧 HTML 遍历仍保留兼容能力。
- 抖音仅提供官方 OAuth/OpenAPI PoC；TapTap、B站、小红书、微博、贴吧在缺少正式授权/API 时 fail-closed，不会伪造采集成功。
- AI 和钉钉均通过独立适配器接入，缺少配置时任务会记录明确失败状态。
- 数据表全部使用 `po_` 前缀，运行于 MySQL 8.0+ 或兼容 MariaDB。

## Local configuration

复制 `.env.example` 为 `.env`，填入数据库、H5 社区和公司 AI/钉钉服务配置。Server、Worker 和迁移命令会在构造连接器/数据库前自动加载该文件；未配置外部平台不会被调用。

**凭据加密（安全红线）**：后台「采集源授权」填写的 Cookie/token 用 AES-256-GCM 加密后落 `po_credentials.secret_cipher`，明文只在服务端内存出现，永不落库、永不日志、永不回显。必须在 `.env` 配置 `CREDENTIAL_ENC_KEY`（32 字节 hex/base64）；缺失或非法时凭据接口 fail-closed 拒绝写入，不降级为明文存储。生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。

## Write API（后台配置）

在只读看板接口之外，新增 7 个写接口支撑后台配置：

| 方法 | 路径 | 说明 |
|------|------|------|
| PATCH | `/api/public-opinion/sources/:id` | 采集源部分更新（enabled/frequencySeconds/activeWindow/displayName） |
| PUT | `/api/public-opinion/sources/:id/credential` | 写入凭据（服务端加密落密文，响应只回显 configured/expireAt，不回显明文） |
| POST | `/api/public-opinion/sources/:id/check-auth` | 走连接器 healthCheck 回写授权状态与凭据校验结果 |
| POST | `/api/public-opinion/sources/:id/collect` | 手动采集入队（打 `collect_requested_at` 标记，Worker 下个 tick 采集；未授权源返回 UNAUTHORIZED，fail-closed） |
| GET | `/api/public-opinion/keyword-rules?gameId=` | 按组聚合并返回该游戏全部关键词规则 |
| POST | `/api/public-opinion/analysis/backfill` | 按筛选条件为历史未分析内容幂等入队；AI 未配置返回 `AI_ANALYSIS_NOT_CONFIGURED` |

补偿入队请求体可使用 `accountId`、`gameId`、`sourceId`、`contentType`、`publishedFrom`、`publishedTo` 和 `limit`（最多 500）。入队后由 Worker 的独立分析消费步骤处理，不要求同时存在到期采集源。

## Start

```bash
npm install
npm run migrate --workspace server
npm run start:server
npm run start:worker
```

Before `migrate`, provide a MySQL/MariaDB `DATABASE_URL` or the `DB_*` settings. Never run a new migration against production without a reviewed deployment window and backup.

## AI 分析口径

所有新增或正文变化的帖子、评论、回复都会持久进入轻分析任务，不再以关键词作为 AI 准入条件。关键词、中高风险、强负面、低置信度或模型升级信号会触发深度分析；深度失败保留轻分析结果并可重试。分析任务状态与采集完整性分别统计，`completed_full` 只表示采集端完整性。

## 每日前一自然日任务

一次性任务按 `Asia/Shanghai` 计算 `[昨天 00:00, 今天 00:00)`，刷新所有已启用且已授权来源的帖子、评论和回复，并只认领该发布时间范围内的分析任务：

```bash
# 只检查数据库、AI、来源授权及执行窗口，不采集或分析
npm run preflight:daily

# 执行后退出；适合每天北京时间 02:00 的外部调度
npm run start:daily
```

该入口不调用全局历史补偿或 `analysisWorker.js`，不会消费范围外的历史积压。它使用数据库 advisory lock 防止同一业务日并发执行；未授权/不支持来源会出现在摘要中，采集 partial 或评论能力不完整时以非零退出，不伪报全量成功。`AI_ANALYSIS_TOKEN`、平台 Cookie/token 等不会写入摘要或日志。

## Handoff

连接器、AI 分析器、通知器和数据库访问层均为独立接口，正式开发只需替换实现，不改变内容归一化模型和 API 契约。详见 `docs/architecture.md`、`docs/api.md` 和 `docs/production-checklist.md`。
