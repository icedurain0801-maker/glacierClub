---
status: failed
priority: P0
date: 2026-09-21
role: test-owner
---

# TapTap v057e 唯一 manual run 独立验收

## 结论

**FAIL（浏览器证据阻塞），退回开发负责人；禁止创建第二个 run。** Worker 与 API/数据库只读核验通过，但 3000 深链未呈现该 run，不能宣布整体 PASS。

## Worker 实际切换核验

- `PublicOpinionWorker=Running`
- active release：`C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1`
- Worker EXE SHA-256：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`
- Worker XML SHA-256：`82CB2AA0B974C0DF980405F3EEF379F88C8C59D12D3EF06AB9AD7DC8111ACBEE`
- manifest SHA-256：`11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`
- `worker/src/worker.js` SHA-256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`
- API EXE/XML hash 未变；Worker XML 指向新 release/worker.js

## 唯一 run API/数据库核验

- runId：`11dcd45f-6442-4e27-92f3-a8ea12c680f1`
- sourceId：`26b47b08-0a0d-4265-b377-3d313e2f1131`
- `trigger_type=manual`，`sync_mode=incremental`
- `started_at=2026-09-21 10:03:03 UTC`，`finished_at=2026-09-21 10:05:42 UTC`
- `attempts=1`，`lease_epoch=1`，`lease_owner=null`，`lease_until=null`，确认终态 lease 已释放
- `status=partial`，`error_code=PARTIAL_SYNC`
- 计数：`discovered=648`、`fetched=599`、`stored=123`、`inserted=3`、`changed=77`、`unchanged=519`、`comments=49819`
- partial 原因：既有 `SYNC_PAGE_BUDGET_EXHAUSTED`

## 3000 浏览器证据

打开深链标签 74：

`http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html?...&platform=taptap&sourceId=26b47b08-0a0d-4265-b377-3d313e2f1131&runId=11dcd45f-6442-4e27-92f3-a8ea12c680f1`

页面能加载后台运行记录结构，平台筛选显示 TapTap，但运行列表显示“当前地区暂无可用社区”，没有该 run 行或终态/计数详情。因此浏览器端无法独立证明唯一 run 已呈现。

## 边界与退回

- 未创建第二个 run；
- 未控制 Worker/API/3001、未写数据库、未调用 provider；
- 请修复/提供可读取该 run 的 3000 验收回源或 fixture 后，使用同一 runId 复测，不得新建 run。
