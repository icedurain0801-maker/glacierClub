# v367 风险分级三样本最小真实补跑超时报告

## 结论

**FAIL / STOPPED / NO RETRY**。

唯一错误：`AI_PROVIDER_TIMEOUT`（正式 runner 日志：`The operation was aborted due to timeout`）。

## 执行标识与证据

- approved runId：`646280fe-c165-4fce-99e7-03290225685f`
- prompt hash：`6d9e1f74de0bcbc699cd04fbb38a62497f6eb8d226a9585ba4e5ed3b96dfc083`
- provider 调用：1 次批调用，覆盖固定三样本；未重试。
- raw provider output：无。provider 在返回响应体前超时，不伪造 raw evidence。
- 运行证据目录：`.tests/2026-09/2026-09-22/evidence/v366-risk-deep-real-rerun-646280fe-c165-4fce-99e7-03290225685f/`

## 前后门禁

- 运行前 DB、`4320` API、`3000` 只读入口均通过。
- 运行后 `3000/health=200`、`4320/health=200`，两路均显示数据库 `ok`。
- `919098` 保持 `negative / deep / sentiment-v1 / gpt-5.6-luna`。
- 三条目标样本未写入 deep 分析结果；正式 runner 将各自 deep job 标记为 `failed`、`attempts=1`。
- 通知尝试 0，3001 访问 0，未扩样本、未改算法、未发布、未 push。

## 3000 临时只读入口

- PID：`29056`
- 监听：仅 `127.0.0.1:3000`
- 上游：仅 `http://127.0.0.1:4320`
- 写方法：`POST/PATCH/PUT/DELETE` 均为 `405 READ_ONLY`
- 停止方式：`Stop-Process -Id 29056`

由于调用额度已经使用且授权禁止循环重试，本 runId 不得再次执行。后续若要重试，必须重新批准并生成新的 approved runId。
