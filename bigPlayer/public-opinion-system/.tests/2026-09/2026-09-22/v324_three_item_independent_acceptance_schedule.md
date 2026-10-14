---
status: scheduled_blocked_by_gates
priority: P0
date: 2026-09-22
role: test-owner
topic: v306d-v066b-risk-real-acceptance
---

# 三项独立验收排期卡

## 受控窗口

以下时间均为 `Asia/Shanghai`，只在窗口实际到达时执行对应验收：

| 时间窗 | 验收责任 | 范围 | 当前动作 |
|---|---|---|---|
| 08:40-08:55 | 测试负责人 | v306d 发布后 `127.0.0.1:3000` 浏览器/API 验收 | 08:40 前仅待命，不提前打开标签或启动服务 |
| 08:40-09:00 | 测试负责人 | 风险四样本预检、快照和模型证据验收 | 仅做预检/证据核对，不写 DB、不扩大样本 |
| 09:00-09:35 | 测试负责人 | BigPlayer 处置后数据验收 | 仅在开发完成备份、029、身份对齐并交接证据后执行；真实 Run 另行建单；以当前 95 个唯一 `cp.id` 为准（NULL 78、legacy 17），执行时必须重新冻结逐 ID 清单 |

当前本机时间：`2026-09-22 08:37:53 +08:00`，尚未到首个执行窗口，保持待命。

## 排期结论

按到达顺序执行三条独立验收线，互不以其他线的 PASS 代替：

1. **v306d 正式发布后浏览器/API/数据验收**：可先执行，前提是正式发布身份和 3000 只读入口明确。
2. **BigPlayer 分阶段处置后一次有界真实 Run**：当前冻结，必须先完成迁移 029、身份对齐和当前 95 条 stale checkpoint/lease 隔离复检，再提供精确 Run 窗口；不得沿用昨日 85-ID 清单。
3. **历史深度模型风险样本验证**：固定 deep profile，补跑 `919167`、`6826813`、`920120` 三条缺失样本；`919098` 必须严格断言 `negative`。历史 deep 完成证据仅覆盖 `919098`，其余样本不能用 pending/缺失记录替代；当前批次曾因 `REAL_AI_SENTIMENT_MISMATCH` fail-fast，未经新 raw provider 证据不得报通过。

总体结论只能按单项输出 `REAL_RUN_PASS`、`REAL_RUN_FAIL` 或 `BLOCKED`；候选层 PASS 不得升级为真实业务 PASS。

## 状态与前置门禁

| 顺序 | 验收线 | 当前状态 | 开始条件 | 当前拒绝点 |
|---|---|---|---|---|
| 1 | v306d 正式发布 | READY_FOR_RELEASE_REVIEW | 正式 release/tag 身份、3000 免登录只读入口、API 版本和数据基线 | 若 3000 仍指向旧代理、入口/manifest 不一致或有失败请求，先拒绝 |
| 2 | BigPlayer 真实 Run | BLOCKED | 029 已登记、config/registry site identity 对齐、当前 stale checkpoint（本次只读为 95 条）有审计处置、active run/lease=0、精确近七天窗口 | v323 已确认 `MULTISITE_SITE_REGISTRY_MISMATCH`、029 缺失、当前 95 条 stale running checkpoint；不得解冻 |
| 3 | 风险深度模型样本 | BLOCKED_ON_RUN_EVIDENCE | 固定 deep profile、新 runId、四样本快照（919098 strict negative + 三条补跑）、运行前后 DB/API/3000 三路证据 | 既有 run 在 919098 处 `REAL_AI_SENTIMENT_MISMATCH`；919167/920120 pending、6826813 无 deep job，未取得新 raw provider 证据不得复用旧批次 |

## 1. v306d 正式发布验收

### 最小执行集

- 校验正式 release、manifest/provenance、`app.js?v=154` 和 public 资源闭包。
- 仅访问 `127.0.0.1:3000` 免登录入口；API 只读，拦截 POST/PATCH/DELETE。
- 桌面 `1440x900` 与移动 `375x667` 各执行一次：四卡顺序/数值、首卡帖子/评论拆分、v154 情感趋势字段。
- 对同一日期窗口分别核对 API、页面和只读数据快照；记录失败请求、404、控制台错误、横向溢出和卡片重叠。

### 通过条件

正式版本身份一致；四卡与 API 数据一致；桌面/移动无几何问题；无 404、失败请求、控制台错误和写请求。

### 退回条件

任何版本漂移、旧资源回退、API/页面数值不一致、请求越权、几何溢出或数据快照缺失，结论为 `REAL_RUN_FAIL` 或 `BLOCKED`，不进入 BigPlayer 真实 Run。

## 2. BigPlayer 分阶段处置后真实 Run

### 解冻顺序

1. 只读确认并记录 migration 027/028/029 ledger；确认 `po_sync_runs` 有 `site_id`、`site_url_snapshot`、`last_request_at`。
2. 由开发/项目负责人完成 source config 与 `po_source_sites` 的 `site_id + normalized URL + url_hash` 对齐；不得直接重键历史 checkpoint。
3. 对当前只读得到的 95 个唯一 `cp.id`（NULL 78、legacy 17）逐 ID 生成不可变 backup/hash 与 quarantine 交接清单；不得沿用旧 85-ID 清单，不得 DELETE、清空 cursor、批量改 NULL site identity。未完成逐 ID 交接时，09:00 数据验收保持 BLOCKED。
4. 重新只读确认目标 source active Run=0、有效 active checkpoint lease=0；任一 `lease_until IS NULL OR lease_until > UTC_TIMESTAMP(3)` 即冻结。
5. 项目经理提供唯一真实 Run ID、source/account/site、近七天半开窗口 `[publishedFrom,publishedTo)` 和 3000 同源只读入口。
6. 测试负责人按 v322 卡执行一次真实 Run，验帖子、评论、回复、去重、checkpoint、lease、partial/error_code 和页面证据。

### 一票否决

身份未对齐、029 未登记、当前 95 条处置不可追溯、窗口不精确、出现重复入库/跨身份 cursor、评论/回复伪报成功、失 lease 后仍写入、3000 页面非同源或产生写请求，均为 `BLOCKED`/退回开发负责人。

## 3. 历史深度模型风险样本

### 固定范围与强断言

- 固定四样本范围：`919098`、`919167`、`6826813`、`920120`；不得扩大样本或历史全量回算。
- `919098`：必须是 `negative`，并按既定规则升级为 `urgent`；若 AI 原始/归一化 sentiment 不是 `negative`，立即 `FAIL / STOPPED`。
- `919167`、`6826813`、`920120`：使用固定 deep profile 补跑，逐条核对 raw provider 响应、deep job、归一化结果和审计原因；不得以 pending/缺失 job 代替完成。
- 既定普通 negative/positive 回归口径继续保留，但不扩展本次真实 deep 样本范围。

### 三路证据与停止规则

- 新 runId 和分析任务 ID；运行前后只读 DB、API、3000 列表/详情闭环。
- 比较 `analysis_reason`、normalization audit、analysisVersion、告警幂等键、通知/outbox 前后计数。
- 任一样本 sentiment、severity、审计原因或样本身份不符，fail-fast；不写后续样本、不重试、不放宽断言。
- 历史深度证据仅有 `919098` 一条 completed；`919167`、`920120` 为 pending，`6826813` 无 deep job，三条必须用新 raw provider 证据补跑后才能判定。
- positive reconciliation 产生告警、重复处理增加告警/通知/outbox、API/页面与 DB 不一致，整体 FAIL。

## 共用安全边界

- 测试负责人不改业务代码，不发布、不合并、不 tag、不 push。
- 3000 仅免登录只读验收；不启动、不访问、不占用 `3001`。
- 不触碰 PID `32020`；不创建未经项目经理明确提供的真实 Run。
- 任何需要写 DB、迁移、quarantine、身份对齐或服务切换的动作退回开发负责人/项目经理，不在测试会话执行。

## 回执与交接

已将本排期卡回执项目经理和开发负责人。下一步只接受：v306d 正式 release + 3000 入口证据；BigPlayer 解冻门禁与唯一 Run 窗口；风险新 runId 与四样本快照。未满足前，分别保持 `READY_FOR_RELEASE_REVIEW`、`BLOCKED`、`BLOCKED_ON_RUN_EVIDENCE`。
