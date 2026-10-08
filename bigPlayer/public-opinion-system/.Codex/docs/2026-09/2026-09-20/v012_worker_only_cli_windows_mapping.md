# Worker-only CLI：Windows workerOps 映射与假控制器演练

状态：映射/隔离演练完成；真实 `--apply` 继续 `REAL_APPLY_UNAUTHORIZED`。

## 固定目标与写入范围

唯一服务为 `PublicOpinionWorker`。授权后 adapter 仅可写：

- `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-<id>`（新目录）；
- `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe/.xml`；
- 批准的 Worker-only snapshot/audit 目录。

拒绝 reparse point、非直接 release 子目录、WinSW hash 非
`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`、API/3001
路径或服务名。切换前后读取并比较 `PublicOpinionApi.exe/.xml` hash、API/3001
PID/state；任一差异 fail-closed。

## 授权后 adapter 的精确 workerOps 映射（本次未执行）

| workerOps | Windows 命令/受控脚本 | 高影响与断言 |
|---|---|---|
| `state()` | `sc.exe query PublicOpinionWorker`，并读取 Worker XML entry/BUILD_SHA | 只读；不得查询/控制 API 作为动作 |
| `stop()` | `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe stop` | 仅短暂停机 Worker；stop 前 snapshot 和 API/3001 hash 已通过 |
| `install()` | 仅新 wrapper/XML 已在 staging 通过 `prepare-worker-preflight.ps1` 后，`PublicOpinionWorker.exe install` | 只允许同名 Worker wrapper；拒绝 XML 参数、API wrapper 或全局 install |
| `start()` | `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe start`，再 `sc.exe query` | 必须 Running，entry/BUILD_SHA=候选；否则事务回滚 |
| rollback | 将 snapshot 的 Worker wrapper/XML 恢复到上述两个 Worker 路径，再执行同一 `install/start` | 只恢复旧 Worker release 引用；禁止 `rollback-services.cmd` |

新 release 由 `build-worker-release.ps1` 构建、`verify-worker-release.js` 复算；staging 由
`prepare-worker-preflight.ps1 -Mode Preflight` 验证。真实 adapter 先把这些命令封装为
受审计 controller，再注入 `worker-only-cutover-transaction.js`；不得由 CLI 自行调用。

## fake controller 完整演练证据

`v227_worker_only_cutover_transaction.test.js` 使用系统临时目录 fake controller 记录
snapshot → stop → wrapper/XML staging/cutover → install/start → readiness → API hash复核。

- 预检失败：未完成切换，结果 `ROLLED_BACK`；
- install/切换失败：恢复旧 Worker，`ROLLED_BACK`；
- readiness 失败：恢复旧 Worker，`ROLLED_BACK`；
- rollback 失败：`MANUAL_STOP_REQUIRED`，口径仅停 `PublicOpinionWorker` 并升级；
- 四个场景均断言 API wrapper/XML 字节不变。

`v229_worker_only_controlled_cli.test.js` 证明唯一 CLI 的 `--preflight` 只读输出目标和禁用项，真实 `--apply` 未授权时 fail-closed。两项测试均已通过；本次未触碰服务、ProgramData、DB 或补跑。

## 演练范围与隔离证据

完整 fake service controller 演练位于 `.tests/2026-09/2026-09-20/v227_worker_only_cutover_transaction.test.js`：每个测试以 `fs.mkdtempSync(os.tmpdir()/po-cutover-*)` 创建独立目录，注入 `state/stop/install/start` fake workerOps，并在 finally 删除该目录。覆盖为：成功链路 1；预检失败 1；切换/install 失败 1；readiness 失败 1；rollback 失败 1，共 5 项；五项均断言 API wrapper/XML 不变。

CLI fake controller 已实现且仅限 `--apply --controller=fake`：每次在 `--isolation-dir` 或系统临时目录创建 `po-cli-fake-*` 工件并清理。v229 覆盖成功、preflight、switch、readiness、rollback 五条 fake 端到端链路，均输出 `apiUnchanged:true`；默认/真实/非fake controller 继续 `REAL_APPLY_UNAUTHORIZED`，不接 ProgramData 或服务。
