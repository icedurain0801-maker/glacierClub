---
status: prepared
priority: P0
date: 2026-09-21
role: test-owner
topic: v066b-bigplayer-real-run-acceptance
---

# v066b BigPlayer 真实 Run 独立验收卡

## 使用边界

本卡只在项目经理确认正式候选 READY、真实账号/源/站点范围和一次性 Run 标识后执行。当前仅准备清单：不写 DB、不创建真实 Run、不触发采集、不占用 `3001`，不得用任何候选 PASS 替代真实业务验收。

允许的运行入口：已确认的免登录 `127.0.0.1:3000` 页面或项目经理指定的真实验收入口。浏览器验收必须使用同一真实 Run 的只读查询；若 3000 没有固定 mock/只读代理，浏览器项记为 BLOCKED，不改用 3001。

## 开始前门禁

以下任一缺失，整轮拒绝开始：

- READY、manifest/provenance、候选与正式基线身份一致，且明确 v066b 的业务 overlay 与版本。
- 真实 Run ID、source/account/site ID、平台 `bigplayer_h5`、授权状态和验收时间窗已由项目经理提供。
- 精确窗口为近七天的半开区间 `[publishedFrom, publishedTo)`，时区与项目约定一致；不得用旧 `historyStart` 代替。
- 明确本轮只验一个有界 Run，采集窗口、站点范围、预算/超时和预期终态可查询。
- 3000 页面只读入口可访问；所有浏览器请求可记录，禁止写请求、真实接口漂移或跨站跳转。
- 已确认不触碰 `3001`、PID `32020`、发布/push、正式路径外的写入操作。

## 最小真实 Run 观测项

必须保存 Run 创建前后同一份只读证据，至少包含：

| 类别 | 必查字段/断言 |
|---|---|
| 身份 | run、source、account、site、platform、task/scope、owner/lease identity |
| 窗口 | `publishedFrom`、`publishedTo`、时区、是否严格半开区间；必须覆盖近七天且不越界 |
| 帖子 | discovered/fetched/stored/inserted/changed/unchanged 计数；同一外部 ID 重放不得重复新增 |
| 评论 | 每个帖子评论窗口与 checkpoint；评论数、声明缺口与有效入库数可区分 |
| 回复 | 一级评论到回复的父子关系、root/parent/depth、回复 checkpoint/task identity；不得把回复混入帖子计数 |
| 分页 | 每页提交后推进 cursor；最后安全 cursor 可续跑；不得跳页、回退或跨 source/account/site/window 复用 |
| 终态 | `completed_full` 仅在帖子、评论、所需回复均显式终止后允许；不完整结果必须 `partial`/`failed` |
| 错误 | partial/failed 时有稳定 `error_code` 和脱敏 message；不得以成功 0 条掩盖异常 |
| lease | active lease 不重复拉取；失 lease 后停止写入；结束时 lease/checkpoint 正确释放或保留可重试状态 |

## 近七天与去重验收

1. 查询 Run 实际 effective window，确认所有帖子、评论、回复的发布日期均满足 `[publishedFrom,publishedTo)`；窗口外内容不得计入本 Run。
2. 对至少一条跨页帖子和一条评论/回复链核对平台外部 ID、root/parent/depth 与入库关系。
3. 只读重载或同 Run 续跑后，确认已提交页不重复新增，计数变化可解释；不得新建第二个同 source/account/site/window 的并发 Run。
4. 同一账号不同窗口、不同站点或不同任务的 checkpoint 必须保持独立。

## 评论/回复窗口验收

- `declaredComments > validPersistedComments` 时必须进入评论 checkpoint/partial，不得解释成“没有评论”。
- 评论空成功页、回复空成功页、缺少 cursor、重复 cursor、连接器超时或写入失败时：不得推进不安全 cursor，不得标记完整成功。
- 回复必须保留帖子根 ID、直接父评论 ID、depth=2（或候选声明的等价层级），并能从只读详情页还原线程。
- 单帖评论/回复失败不得吞掉其他帖子，但 Run 总状态必须反映 `partial` 或明确失败原因。

## 3000 浏览器一次验收

仅在真实 Run 已存在且提供只读页面/代理后执行：

- 访问 `127.0.0.1:3000/admin/PublicOpinion/collection-runs.html` 或项目经理指定的等价详情 URL。
- 页面显示同一 Run 的 source/account/site、近七天窗口、帖子/评论/回复计数、checkpoint cursor、终态和 `error_code`。
- 浏览器重载后 cursor、计数、partial 原因与后端只读查询一致。
- 控制台无错误、无 404、无横向溢出；网络仅允许 GET/HEAD，任何 POST/PATCH/DELETE 均为拒绝条件。
- 截取桌面与 `375x667` 证据，记录 URL、时间、Run ID 和响应状态；不上传凭据或敏感内容。

## 一票否决与退回开发负责人

- 真实 Run 缺少 exact effective window，或近七天窗口被旧 `historyStart` 覆盖。
- 发现窗口外数据、重复新增、同 identity 并发拉取或 checkpoint 跨 source/account/site/window 复用。
- 评论/回复缺口被伪报成功 0 条，或未保存安全 cursor/稳定错误码。
- `completed_full` 时仍有未终止 feed、评论页或 reply task；partial/failed 没有可诊断状态。
- 失 lease 后仍写入，lease 未释放，或重试丢失 cursor。
- 3000 页面命中真实写接口、访问/占用 3001、出现控制台错误/404/横向溢出，或无法证明页面数据与 Run 同源。
- 只能提供候选 fixture、单元测试或静态截图，无法提供真实 Run 只读证据。

## 交付证据格式

- Run ID、source/account/site、effective window、测试开始/结束时间。
- API/DB 只读快照：状态、计数、checkpoint、lease、错误码；敏感字段脱敏。
- 帖子 1 条、评论 1 条、回复 1 条的外部 ID 与父子关系核对结果。
- 3000 桌面与 `375x667` 页面截图/DOM 几何、请求状态与控制台日志摘要。
- 结论只能为 `REAL_RUN_PASS`、`REAL_RUN_FAIL` 或 `BLOCKED`；候选层 PASS 不得升级为 `REAL_RUN_PASS`。
