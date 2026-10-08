---
status: completed_authorized_scope
scope: one-controlled-runtime
run_id: f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9
---

# BigPlayer 单次受控真实 Run 结果

## 运行范围

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- platform：`bigplayer_h5`；region：`domestic`
- 北京时间窗口：`2026-09-23 00:00:00` 至 `2026-09-24 08:56:54`
- UTC 请求窗口：`2026-09-22T16:00:00Z` 至 `2026-09-24T00:56:54Z`
- 只执行本次受控 Run，未重试；未修改 schema、迁移或其他平台。

## Run 结果

- status：`completed_authorized_scope`
- error_code/error_message：`null`
- discovered：`905`
- fetched：`209`
- stored：`568`
- inserted：`58`
- changed：`151`
- unchanged：`0`
- comment_count：`337`
- run started：`2026-09-24 08:57:31`
- run finished：`2026-09-24 08:58:47`

## Checkpoint 与 AI

- 目标账号本次窗口相关 checkpoint：`236`；`completed=233`、`running=3`，合计 `items_fetched=905`。3 个 running checkpoint 未再触发重试，保留原始状态待项目经理后续处理。
- 分析进度只读查询：`total=686`、`pending=686`、`running=0`、`completed=0`、`failed=0`；本次 Run 只完成采集入库，AI 队列未被消费，未将其误报为完成。

## 结论

登录会话客户端已实际到达连接器，单次受控采集完成并产生授权范围数据。`BIGPLAYER_API_SYNC_ENABLED` gate 不在本记录中解除；不执行第二次真实 Run。
