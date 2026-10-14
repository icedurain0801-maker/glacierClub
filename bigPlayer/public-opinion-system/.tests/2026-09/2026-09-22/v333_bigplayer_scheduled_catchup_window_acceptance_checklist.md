---
status: prepared_waiting_candidate
date: 2026-09-22
role: test-owner
topic: BigPlayer scheduled_catchup 当日窗口漏抓
sampleRunId: 3a245915-416b-45c0-93b5-b78be30f9da4
---

# BigPlayer scheduled_catchup 窗口修复验收清单

## 验收边界

- 只验 BigPlayer 定时增量窗口和任务详情；不做真实补跑，不修改业务代码、DB、配置或服务。
- Discord、TapTap 仅做回归，不扩大窗口语义变更范围。
- 浏览器只允许 `127.0.0.1:3000` 免登录只读入口；POST/PATCH/DELETE 必须拦截；不访问 3001。
- 候选必须先提供同一 UTC evidenceId、manifest/hash、运行实例/入口和 3000 最小验证；候选未 READY 时本清单只处于准备状态。

## A. 00:01 catchup 主场景

前置：BigPlayer 源站 fixture/真实只读证据包含北京时间 9/22 00:00:10 发布的帖子和评论；触发类型为 `scheduled_catchup`，运行约 00:01 执行。

1. 核对 `scheduled_at`、`started_at`、`window_start`、`window_end` 的时区和开闭区间。
2. 预期 `window_end` 不早于本次实际执行截止时刻，且覆盖 00:00:10 内容。
3. 同一 Run 的 posts 和 comments 均出现对应内容；两者使用同一 `< window_end` 语义。
4. 详情显示“按实际补跑时刻截止”或等价解释，不暗示覆盖页面打开时刻。

## B. 多槽位 catchup

前置：服务错过至少 3 个调度槽后于北京时间 9/22 10:00 恢复。

- 只生成最近一个未处理槽的 `scheduled_catchup`，不得历史槽批量回放。
- `window_end` 不早于实际补跑时刻；9/22 当天内容不能因自然日锚点被排除。
- 详情可解释 `scheduled_at` 与 `started_at` 的差异及窗口来源。

## C. 边界时刻

准备三条内容：发布时间恰好等于 `window_start`、恰好等于 `window_end`、晚于 `window_end`。分别验证帖子和真实评论：

- 按统一半开窗口 `[window_start, window_end)` 处理；等于 `window_start` 应纳入。
- 等于 `window_end` 应按项目既定规则一致排除或纳入，但 posts/comments 必须一致且有证据。
- 晚于 `window_end` 不得进入本 Run。

## D. 窗口无新增

接口请求成功但窗口内没有新帖子/评论时：

- Run 为成功或约定的空结果终态，不得误报授权失败。
- 详情明确显示“窗口内无新增”，并保留窗口范围、请求成功和 posts/comments 计数。
- 不得把空结果与“窗口未覆盖当天”混为一谈。

## E. 详情计数与声明评论拆分

- 单独展示帖子数量、真实评论正文数量、帖子声明评论数。
- 样本 `runId=3a245915-416b-45c0-93b5-b78be30f9da4` 的历史口径中，`评论 4717` 是帖子声明评论数汇总，不得当作本次真实评论正文数。
- 详情/API/数据库关联计数相互可追溯；不能用总评论声明数掩盖真实 comments scope 漏抓。

## F. Discord/TapTap 回归

- 各取一条当天内容样本，确认原有窗口、状态、计数和错误码不回退。
- 确认 BigPlayer 的 catchup 上界修复没有改变 Discord/TapTap 的手动同步、固定槽和评论 scope 语义。
- 仅使用已有候选 fixture/只读证据，不触发真实补跑。

## G. 3000 浏览器只读验收

1. 打开概览页、抓取任务记录页和任务详情页，确认 URL 同源为 `127.0.0.1:3000`。
2. 核对列表筛选能定位 `runId`、`trigger_type=scheduled_catchup`、状态和时间窗口。
3. 核对详情同时显示 posts/comments scope、窗口解释、声明评论/真实评论拆分和新增/变更/未变化/跳过/越界计数。
4. 读取浏览器 console/network；GET/HEAD 应成功，POST/PATCH/DELETE 不得发出。
5. 桌面和移动视口各验一次，重点检查窗口文本、计数和错误说明不重叠或截断。

## 判定门槛

- 任一 scope 使用不同窗口边界、`window_end` 早于实际执行截止、边界处理不一致、声明评论冒充真实评论、空新增误报授权失败、3000 非同源或产生写请求，均为 FAIL/BLOCKED。
- 通过离线单测、静态页面或 `authorized` 元数据不能替代同一 Run 的 posts/comments 数据和详情证据。
