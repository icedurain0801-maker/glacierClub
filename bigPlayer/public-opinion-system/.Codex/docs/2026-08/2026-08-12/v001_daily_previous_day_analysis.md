# 每日前一自然日采集与分析

## 目标

新增一次性 daily runner，每天北京时间 02:00 可由外部调度启动。任务刷新已启用且已授权来源的帖子、评论和回复，并只分析内容自身发布时间位于前一北京时间自然日的数据。

## 时间口径

- 时区：`Asia/Shanghai`
- 区间：`[昨天 00:00, 今天 00:00)`
- 数据库连接使用 UTC；runner 将北京时间边界转换为 UTC 后传入查询。
- `published_at` 为空或恰好等于今天 00:00 的内容不进入本批分析。

## 隔离保障

- `claimAnalysisJobs` 支持 `publishedFrom/publishedTo`，只认领范围内任务。
- 每次 claim 使用唯一 lease owner，避免同进程并发批次串领。
- daily runner 只调用带日期范围的缺失任务入队和消费循环，固定 `force=false`。
- 不调用普通 Worker 的无范围历史补偿，不启动 `analysisWorker.js`，不删除或重置旧任务。
- light 升级 deep 后，deep 消费仍使用同一日期范围。
- 数据库 advisory lock 防止同一业务日重复运行。

## 采集边界

- 复用现有 connector 授权闸门、分页、checkpoint、评论与回复任务。
- 不重置帖子/feed checkpoint。
- daily runner 会重新认领已完成的评论 checkpoint，从头刷新已存父帖的评论树，以发现历史帖子下昨天新增的评论和回复。
- 未授权、缺少账号、缺少连接器或不支持评论能力的来源会明确列在摘要中；采集 partial 或能力不完整时返回非零退出码。

## 命令

```bash
npm run preflight:daily
npm run start:daily
```

- `preflight:daily`：只检查数据库、AI 配置、来源账号与授权，不采集、不分析。
- `start:daily`：采集、限定范围入队、限定范围消费，完成后关闭数据库连接并退出。
- `DAILY_ANALYSIS_TIMEOUT_MS`：整批分析超时，默认 2 小时。
- `DAILY_ANALYSIS_IDLE_MS`：无进展时轮询间隔，默认 1 秒。

## 调度

验证首次执行成功后，使用每天北京时间 02:00 的持久自动任务调用 `npm run start:daily`。不得改为启动常驻 Worker 或全局 analysis worker。

## 安全

- AI Token、平台 Cookie/token、credential 明文只从本机环境或加密凭据上下文读取。
- runner 摘要不包含凭据、Authorization 头、provider 原始响应或敏感请求体。
- 未新增 migration，未自动执行生产 migration。
