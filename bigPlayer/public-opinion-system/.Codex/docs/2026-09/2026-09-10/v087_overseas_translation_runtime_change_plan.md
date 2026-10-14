---
last_updated: 2026-09-10
status: blocked_external_inputs
scope: overseas-translation-runtime-change-plan
owner: 开发负责人
source_admission: .Codex/docs/2026-09/2026-09-10/v086_overseas_translation_runtime_admission.md
---

# v087 境外中文翻译运行变更与回滚方案

## 结论

当前不得启用 translation worker。代码侧已具备单轮执行能力，但运行环境还缺少供应商确认的翻译模型、凭据有效性、额度和价格证据，且根 `.env` 第 46 行会关闭 Node.js 全局 TLS 证书校验。

## 精确配置来源

`AiTranslator` 按以下顺序解析配置：

| 配置 | 首选 | 回退 | 当前状态 |
|---|---|---|---|
| API 协议 | `AI_TRANSLATION_API` | `AI_ANALYSIS_API` / `openai-chat-completions` | 使用 OpenAI 兼容协议 |
| URL | `AI_TRANSLATION_URL` | `AI_ANALYSIS_URL` | 回退到 HTTPS `chat-test.q1.com/openai/v1/chat/completions` |
| Token | `AI_TRANSLATION_TOKEN` | `AI_ANALYSIS_TOKEN` | 回退变量存在，值未读取 |
| Model | `AI_TRANSLATION_MODEL` | `AI_ANALYSIS_MODEL` | 两者均缺失，当前不可运行 |

本机现有 `AI_ANALYSIS_LIGHT_MODEL=gpt-4.1-mini`、`AI_ANALYSIS_DEEP_MODEL=gpt-5.6-luna`，但翻译器不会读取这两个变量。历史文档只证明 `gpt-4.1-mini` 曾用于同一测试网关的分析请求，不证明它当前仍开放或适合翻译。因此唯一推荐方案是由 AI 网关负责人确认一个当前可用的精确模型 ID，再显式写入 `AI_TRANSLATION_MODEL`；不得靠猜测配置。

## TLS 注入点与影响面

- 精确注入点：仓库根 `.env` 第 46 行的 `NODE_TLS_REJECT_UNAUTHORIZED`；Process、User、Machine 三层系统环境均未设置该键，问题来源已收敛到项目 `.env`。
- 加载器：`server/src/runtimeEnv.js` 固定读取仓库根 `.env`。
- 直接加载入口：`server/src/app.js`、`server/src/db/migrate.js`、`worker/src/worker.js`、`worker/src/translationWorker.js`、`worker/src/q1DailyAnalysisRunner.js`、`worker/src/q1DailyJob.js`、`scripts/resolve_source_credential.js`。
- 间接受影响入口：`worker/src/analysisWorker.js`、`worker/src/dailyRunner.js` 均通过 `worker.js` 加载环境。
- 当前匹配的 Node 进程：server 2 个、worker 1 个、analysis-worker 1 个；translation-worker 未运行。
- 网络检查：DNS PASS；显式 `rejectUnauthorized=true` 时 TLSv1.3 握手 PASS。这证明没有继续保留全局禁用项的必要。

## 外部最小资产清单

| External owner | 必须提供的最小资产 | 验收证据 |
|---|---|---|
| AI 网关负责人 | 当前允许的精确模型 ID、Token 是否 active、模型权限、Token 到期时间 | 脱敏管理面截图或签名导出；仅显示状态、模型、权限和到期时间，不显示 Token |
| AI 网关/财务负责人 | 输入/输出每百万 token 单价、币种、计费账户、余额或预算上限 | 带时间戳的价格页和余额/预算截图 |
| AI 网关负责人 | RPM、TPM、日/月配额及 429 响应策略 | 带时间戳的配额页或正式接口文档 |
| 运维负责人 | 根 `.env` 的受控备份、删除 TLS 禁用项、写入专用翻译模型与专用 Token、受影响进程重启窗口 | 变更单号、配置键清单、进程重启记录；禁止记录秘密值 |
| 项目经理 | 单任务真实调用预算与执行窗口 | 明确批准的调用次数上限 1 和可接受费用上限 |

## 凭据健康探测方式

优先使用供应商管理面验证 Token 的 active、scope、expiry 和 model access，不产生模型调用。若供应商没有管理面健康接口，则在项目经理单独授权后，用专用翻译 Token 对已确认模型发送一次不含业务数据的固定文本 `health-check`，请求输出上限设为 8 tokens。

探测日志只允许记录：UTC 时间、HTTPS 状态码、供应商 request ID、模型 ID、耗时、TLS 协议；禁止记录 Authorization、Token、请求头、响应正文或原始业务内容。HTTP 2xx 仅证明凭据和模型可调用，不代表翻译质量通过。

## 积压与预算计算

只读快照：境外有效内容 10,092 条；当前指纹缺译文 9,303 条；原始标题和正文合计约 769,893 字符；任务 pending 71、retryable 9,142、completed 789、failed 36、running 0。9,142 条 retryable 的错误码均为 `AI_TRANSLATION_DAILY_LIMIT_REACHED`。

- 理想调用量：9,303 次成功请求。
- 当前单进程应用上限：1,000 次实际 HTTP 请求/日；不考虑失败时，理论最短 10 天。
- 失败放大上限：单次任务调用最多 4 次 HTTP 尝试，任务最多领取 3 次，理论极端上限为 `9,303 × 4 × 3 = 111,636` 次请求。
- 费用公式：`输入 token ÷ 1,000,000 × 输入单价 + 输出 token ÷ 1,000,000 × 输出单价`。模型和单价未确认前不得填写金额或批准全量运行。
- 当前每日上限是单进程内存计数；重启或多实例会重新计数，不能充当跨进程费用硬闸门。

推荐分段只作为后续审批基线，不代表执行授权：1 条真实验收 → 20 条观察批 → 100 条小批 → 每日不超过经供应商确认的预算上限。每段必须检查成功率、429/5xx/超时率、平均 token 和实际费用后再进入下一段。

## 逐步变更方案

1. AI 网关负责人提交上表中的模型、凭据、额度和价格证据；项目经理确认单任务预算。
2. 运维备份根 `.env` 的权限和配置键清单，备份文件不得进入仓库。
3. 运维删除根 `.env` 第 46 行的 TLS 禁用配置，不以任何等价环境变量重新注入。
4. 运维写入独立的 `AI_TRANSLATION_URL`、`AI_TRANSLATION_TOKEN`、`AI_TRANSLATION_MODEL`；不再依赖分析服务回退配置。Token 仅放受控环境或秘密管理器。
5. 保持 translation worker 停止，先执行 DNS 与显式证书校验 TLS 握手；失败则停止，不降级证书校验。
6. 经单独授权后执行一次脱敏凭据健康探测；确认 2xx、模型 ID 和配额头符合供应商文档。
7. 设置单进程临时覆盖：`AI_TRANSLATION_JOB_BATCH_SIZE=1`、`AI_TRANSLATION_BACKFILL_BATCH_SIZE=1`、`AI_TRANSLATION_DAILY_CALL_LIMIT=1`，调用导出的 `runOnce()` 一次，不启动无限循环。
8. 只读核对该任务从 running 到 completed、译文指纹/版本一致，并通过详情 API 与页面检查同一内容；记录 request ID 和任务 ID，不记录正文。
9. 停止单次进程，恢复三个批量/限额键到经审批的生产值。全量积压处理必须另开变更单。

## 单任务执行入口

仅在前置项全部通过且获得新的真实调用授权后执行：

```powershell
$env:AI_TRANSLATION_JOB_BATCH_SIZE='1'
$env:AI_TRANSLATION_BACKFILL_BATCH_SIZE='1'
$env:AI_TRANSLATION_DAILY_CALL_LIMIT='1'
node -e "const {buildDeps,runOnce}=require('./worker/src/translationWorker'); const d=buildDeps(); runOnce(d).then(r=>console.log(JSON.stringify(r))).finally(()=>d.repo.pool.end())"
```

该命令只执行一轮并最多领取一个任务，不启动 `start:translation` 常驻循环。执行前必须确认没有其他 translation worker，并记录待领取任务的 ID 与 content ID；执行后以同一 ID 做只读核验。

## 回滚方案

1. 单任务命令异常时不重试、不启动常驻 Worker；等待任务租约自然到期，保留错误码作为证据。
2. 停止本次一次性进程，清除三个临时进程级批量/限额覆盖变量。
3. 配置错误时恢复受控备份中的翻译 URL、模型和 Token 配置；Token 泄露或 401 时由 AI 网关负责人吊销并轮换。
4. TLS 失败时保持 Worker 停止并修复证书链、DNS 或网关配置；禁止通过恢复 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过。
5. 不删除译文或任务记录；如单任务已 completed，将其作为可审计验收证据保留。

## 放行门禁

以下全部满足后，才允许项目经理另行授权单任务真实验收：

- 精确 `AI_TRANSLATION_MODEL` 已由网关负责人确认并配置。
- 专用翻译 Token 的 active、scope、expiry、model access 已有脱敏证据。
- 根 `.env` 不再关闭 TLS 校验，受影响进程在批准窗口内完成有序重启。
- 供应商 RPM、TPM、日/月额度、单价和可用预算已确认。
- 同时运行的 translation worker 数量为 0，单任务入口批量与每日上限均为 1。
- 项目经理明确批准一次外呼、一次任务写入和详情链路核验。
