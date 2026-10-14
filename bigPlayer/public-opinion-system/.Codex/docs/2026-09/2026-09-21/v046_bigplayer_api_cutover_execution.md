---
candidate: v046-bigplayer-api-cutover-20260921-0200
status: CUTOVER_PASS_SYNC_BLOCKED
---

# v046 BigPlayer API Cutover Execution

## 执行结果

- API 旧 release `release-31135-668-15061` 保留，未删除。
- API 已切换至 `C:\ProgramData\PublicOpinion\releases\v046-bigplayer-api-cutover-20260921-0200`。
- `PublicOpinionApi` 服务已重启并保持 `RUNNING`，health HTTP 200。
- Worker 未重启，TapTap 未触碰，数据库 migration 未回滚。

## 唯一 sync 结果

- 目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`。
- 目标 account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`。
- 仅发起一次 `POST /api/public-opinion/sources/{sourceId}/sync`，body `{"mode":"incremental"}`。
- 返回 HTTP `401`，错误 `AUTH_REFRESH_FAILED`；未生成新 `runId`。
- 只读数据库核验：最新仍为旧失败 run `1a709456-95b3-4df8-9181-0244533c6449`，`LOGIN_SESSION_SERVICE_UNAVAILABLE`；`919716` 入库行数为 0。

## 停步边界

不重试、不补跑、不回滚 API、不重启 Worker。审计证据：`C:\ProgramData\PublicOpinion\audit\v046-cutover-sync-stop.json`。
