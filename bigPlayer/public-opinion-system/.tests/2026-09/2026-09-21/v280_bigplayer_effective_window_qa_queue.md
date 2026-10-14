# BigPlayer Effective Window P0 独立验收准备

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 当前状态：等待开发负责人交付候选、夹具复跑结果和明确样本；本报告仅准备验收，不启动新 run、不切 live、不改代码。
- 需求依据：`.Codex/docs/2026-09/2026-09-21/v056_bigplayer_bounded_cleanup_and_comment_candidates.md`。

## 交测状态

**等待开发。**

开发完成后必须一次性交付：候选路径与 manifest/hash、Worker 全量测试结果、effective-window 定向夹具结果、预期 machine-readable error code、B gap scan 样本，以及定时路径是否实现的明确声明。缺少任一项退回，不进入真实 run 验收。

## A. 无窗口 Fail-Closed

### API/数据用例

1. 构造或读取一个 BigPlayer manual/precreated run，使 `window_start` 或 `window_end` 缺失、为空或只存在一端；调用 Worker claim/执行入口。
2. 预期：不调用 connector、不写入内容、不创建评论/分析任务，run 进入稳定 `failed/partial` 状态并写入候选约定的错误码；不得默认为全历史、不得使用旧 `historyStart` 兜底。
3. API 手动入口对缺省窗口必须按候选合同处理：若服务端负责计算，则必须在创建 run 前持久化完整 effective window；若请求不能安全计算，则返回稳定 4xx 并不创建 run。
4. `window_start >= window_end`、超过 7 天、`publishedTo` 在未来、非 UTC 或无法解析的窗口均 fail-closed，不产生新 run/checkpoint。

### 浏览器入口

- `http://127.0.0.1:3000/admin/PublicOpinion/sources.html`
- `http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html`

浏览器只验证错误可见、run 终态与 API 一致；不得通过页面点击制造未授权或无窗口真实 run。

### 关闭条件

缺窗口、半窗口、非法窗口和超窗各有 API/数据库断言；错误码稳定且无 connector/写入副作用；浏览器记录显示可诊断失败而非“成功 0 条”。

## B. 手动 Effective Window 锚定

### 固定计算口径

在数据库 UTC admission time `now` 下，手动 BigPlayer 有界窗口必须为：

```text
publishedTo = now
publishedFrom = max(now - 7 days, last successful checkpoint)
```

`last successful checkpoint` 仅可使用同一 source/account/site、同一 task/window 语义下最近一次成功安全边界；不得读取其他社区、站点或失败 checkpoint，不得回退账户旧 `historyStart`。

### API/数据用例

1. 无成功 checkpoint：验证窗口为 `[now-7d, now)`，两端持久化到 parent/child run 和 checkpoint。
2. 有较新的成功 checkpoint：验证起点锚定该 checkpoint，不早于 `now-7d`；窗口长度可小于 7 天但不得超过 7 天。
3. 有超过 7 天的旧成功 checkpoint：验证仍从 `now-7d` 起，不扩大历史范围。
4. 重复同一 source/account/site/window 的手动请求：复用或拒绝现有 active run，不能创建重复 run/checkpoint；不同合法窗口可按既有并发门禁处理。
5. Worker connector 首次调用参数必须与持久化 `window_start/window_end` 完全一致，评论/回复阶段也必须继承同一窗口。

### 浏览器入口

在 `collection-runs.html` 打开该 run 详情，核对 `runId`、`window_start/window_end`、source/site、checkpoint 和进度；`content.html` 使用同一 publishedFrom/publishedTo 查询，核对列表没有窗口外内容。

### 关闭条件

至少两组数据：无 checkpoint 与有较新 checkpoint；每组都有 runId、数据库窗口、首个 connector 请求/日志、checkpoint 和浏览器记录，且公式逐字段一致。

## C. B Gap Scan 同窗口与 declared=0 门禁

### API/数据用例

1. `declaredComments > validPersistedComments` 的 BigPlayer 帖子：gap scan 只为缺口帖子入队，使用与本次 effective window 完全相同的 `window_start/window_end`；不扩大到全历史。
2. `declaredComments = 0` 且无未完成 comments checkpoint：不得入队，不创建 run/checkpoint/分析任务。
3. `declaredComments = 0` 但存在未完成 checkpoint：按 checkpoint 状态继续处理，不能仅因声明数为 0 静默删除续跑任务。
4. 已有有效 lease 的 active checkpoint：gap scan 不重复入队；lease 释放后重试保持同一窗口和 task identity。
5. 同一 gap scan 二次执行：内容、checkpoint、analysis job 和统计均幂等，不重复增长。
6. 评论接口空返回但声明数大于 0：run 必须 `partial/failed`、保留可重试 checkpoint 和稳定错误码，绝不能 success 0。

### 样本

- 必须提供一个真实或脱敏合同样本：声明数大于本地有效数的帖子，包含声明数、有效顶层评论数、回复数、source/account/site、effective window。
- 必须提供一个 `declared=0` 对照样本，证明没有误入队。

### 浏览器入口

`collection-runs.html` 查看 gap run/checkpoint，`content.html` 查看评论树和窗口；页面计数只能来自实际内容，不得以声明数冒充入库数。

### 关闭条件

gap>0 入队且同窗、declared=0 不入队、active lease 去重、空返回不成功四组断言全部通过，并有 API/数据库/浏览器证据。

## D. 定时路径硬门禁

当前交测预告未声明定时 effective-window 已实现。若候选仍未实现定时路径：

- 必须明确标记 **BLOCKED / 退回开发负责人**；
- 不得用手动窗口 PASS 推导定时通过；
- 不得创建或篡改 scheduled/catch-up run 来制造证据；
- 仅在开发交付定时实现、定向测试和明确 run 方案后，另开定时真实验收。

定时验收的最低证据（实现后）：scheduled/catch-up runId、调度槽、持久 effective window、子任务/评论 checkpoint、终态和独立浏览器任务记录；所有字段与手动路径同口径。

## 总关闭条件

无窗口 fail-closed、手动 effective-window 公式、B gap scan 同窗与 declared=0 对照、重复/lease 幂等、错误不伪成功全部通过；定时路径已实现并另有真实证据，或明确保持 BLOCKED。缺少候选 hash、runId、样本或独立浏览器记录，不得关闭 P0。
