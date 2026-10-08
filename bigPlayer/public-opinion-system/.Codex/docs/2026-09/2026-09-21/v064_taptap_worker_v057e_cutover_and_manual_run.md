# v064 TapTap Worker v057e 切换与唯一 manual run

## Worker 切换

- 唯一真实切换开始：`2026-09-21 18:00:57 +08:00`。
- 受控 CLI 结果：`PASS`，`apiUnchanged=true`。
- 服务：`PublicOpinionWorker=RUNNING`，wrapper PID `39456`，Node PID `32020`。
- active release：`C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1`。
- active Worker EXE SHA-256：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`。
- active Worker XML SHA-256：`82CB2AA0B974C0DF980405F3EEF379F88C8C59D12D3EF06AB9AD7DC8111ACBEE`。
- release manifest SHA-256：`11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`。
- release `worker/src/worker.js` SHA-256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`。
- API EXE/XML 哈希保持不变；DB health、TapTap connector health、Worker schema/lease/epoch readiness 均通过。

## 唯一 TapTap manual run

- `runId`：`11dcd45f-6442-4e27-92f3-a8ea12c680f1`
- `sourceId`：`26b47b08-0a0d-4265-b377-3d313e2f1131`
- `trigger_type=manual`，`sync_mode=incremental`，创建响应 `reused=false`。
- `started_at=2026-09-21 10:03:03 UTC`，`finished_at=2026-09-21 10:05:42 UTC`。
- `attempts=1`，`lease_epoch=1`；终态后 `lease_owner`、`lease_until` 已按设计释放为 `NULL`。
- 终态：`partial`，`error_code=PARTIAL_SYNC`。
- 计数：`discovered=648`、`fetched=599`、`stored=123`、`inserted=3`、`changed=77`、`unchanged=519`、`comment_count=49819`。
- 部分完成原因：`owned_content` 达到既有 `SYNC_PAGE_BUDGET_EXHAUSTED` 边界。
- 唯一性：创建时间窗口内仅 1 条 manual run；未重试、未创建第二 run。

## 运行状态

- 稳定 Worker 心跳：`worker:LIUFUYI-2-48`，`mode=enabled`，`build_sha=11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`。
- 最近扫描状态：`completed`，无 scan error。
- 未操作 BigPlayer、API、3001、其他服务，未手工写数据库，未 push 或发版。
