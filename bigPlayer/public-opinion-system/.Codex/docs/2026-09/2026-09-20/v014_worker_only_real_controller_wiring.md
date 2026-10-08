# Worker-only controller 接线（隔离演练）

状态：隔离自测完成，待 QA 独立验收。未对真实服务执行任何命令。

唯一 CLI `scripts/windows-services/worker-only-controlled-cutover.js` 现在包含
`createPublicOpinionWorkerController`。其唯一允许的服务身份是
`PublicOpinionWorker`，并将事务状态机所需操作映射为：

| 操作 | 受控命令 |
|---|---|
| `state` / 预检 | `sc.exe query PublicOpinionWorker` |
| `stop` | `PublicOpinionWorker.exe stop` |
| `install` | `PublicOpinionWorker.exe install` |
| `start` | `PublicOpinionWorker.exe start` |

该 controller 只提供给既有 `worker-only-cutover-transaction.js`；失败后的恢复继续由
该事务只写回 Worker wrapper/XML，绝不调用全局 rollback。API/3001 不在 controller
命令集合中。

真实或非 fake `--apply` 仍在 controller 创建和任意服务命令前，以
`REAL_APPLY_UNAUTHORIZED` 终止。测试使用相同 controller API 的临时目录 substitute，
未访问 ProgramData、服务、数据库或 Provider。

## 自测

```powershell
node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js
node --check scripts/windows-services/worker-only-controlled-cutover.js
```

结果：11/11 PASS。覆盖成功、预检失败、停机失败、安装失败、启动失败、readiness
失败、回滚失败，以及 API/3001 不变断言；另保留工件快照和哈希拒绝合同。
