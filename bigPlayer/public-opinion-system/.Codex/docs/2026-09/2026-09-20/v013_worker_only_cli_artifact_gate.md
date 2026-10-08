# Worker-only CLI 工件门禁（隔离）

状态：已完成隔离自测，待测试负责人独立验收；未连接真实服务。

`scripts/windows-services/worker-only-controlled-cutover.js` 仍是唯一 CLI。本次在
`--apply --controller=fake` 的同参数演练路径中新增候选、Worker、API 与快照工件门禁：

- 所有文件以 `lstat` 验证为普通非链接文件，并拒绝父路径中的 reparse link；候选 release 必须为非链接目录。
- `verified-snapshot` 必须声明 `PublicOpinionWorker`，并固定 Worker wrapper/XML、API wrapper/XML 的 SHA-256。
- 候选 WinSW wrapper 的 SHA-256 必须匹配固定 hash；fake 演练只允许测试显式传入自己的固定测试 hash，不影响真实固定 hash。
- 快照或候选 hash 不匹配在 `cutover()` 前失败，故不会调用 `stop/install/start`。

真实或非 fake `--apply` 仍优先返回 `REAL_APPLY_UNAUTHORIZED`，且在任何服务调用、ProgramData 写入、DB 操作或补跑之前终止；本次没有实现或执行真实 controller。

## 自测

```powershell
node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js
node --check scripts/windows-services/worker-only-controlled-cutover.js
git diff --check -- scripts/windows-services/worker-only-controlled-cutover.js .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js
```

结果：9/9 PASS。覆盖原有 fake 成功及四类事务故障、显式同参数工件成功、快照 hash 拒绝、候选 hash 拒绝。未部署、未重启、未访问 ProgramData/服务/DB、未补跑或发版。
