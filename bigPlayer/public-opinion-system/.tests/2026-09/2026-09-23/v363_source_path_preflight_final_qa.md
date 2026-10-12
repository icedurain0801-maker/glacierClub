# v363 Source 路径与运行前置独立 QA

## 结论

**PASS / READY_FOR_THIRD_APPLY_WINDOW**。

- executor：`7/7 PASS`，含任意 cwd source 解析与 hash 校验。
- execution-gates：`4/4 PASS`。
- immutable inventory：`425/425 MATCH`，不含 `apply-state.json`。
- source：`.temp/releases/bigplayer-worker-20260922-v358` 存在，Worker SHA-256 为 `974B80E25023BD60DD946C9D741B176E69BA6317A5489374EEB90985C4DB21A8`。
- 脚本已使用 candidate root 下 `..\\..\\releases\\bigplayer-worker-20260922-v358` 并校验 resolved path/hash；任意 cwd 回归通过。
- Worker 服务只读核验：`PublicOpinionWorker=Running`，PID `39456`，命令行为 `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe`。
- `4320/health=200`，database status=`ok`。
- 运行前置 heartbeat（worker_id、enabled、last_seen age）采用开发负责人提交的只读证据；本次未执行 Apply、切换、真实 Run 或生产写入。

v370 已按项目经理撤单要求保持 HOLD_SCOPE_DEVIATION，未启动测试或写报告。
