# TapTap Cursor：Worker-only 受控发布 Runbook

日期：2026-09-20

状态：待用户重新授权；本文所有命令均为**授权后执行**，本次未执行任何命令

## 目的、范围和硬边界

目标是将已验证的 TapTap cursor 单一 hunk 发布为一个新的 Worker release：TapTap
`owned_content` incremental 使用保存的 `checkpoint.cursor`，不再强制清空。保留
`SYNC_PAGE_BUDGET=20`、按频率触发、近一周边界和已采去重。

允许范围仅限新的 `PublicOpinionWorker` release、Worker wrapper/XML 及 Worker 服务。
严禁：API/3001 变更或服务控制、数据库写入/迁移、人工补跑、Provider 调用、翻译服务变更、
全局 `rollback-services.cmd`、共享工作树整体打包、push 或发版。

候选事实与证据见 `v004`–`v006`：候选与已验证 Worker 基线逐文件只差
`worker/src/worker.js` 和重新生成的 manifest；候选 entry SHA-256 为
`EC8727D3BE62357A1AA1D4315F5A4E3C58C797988D805964627CFF39C1667792`，manifest
SHA-256 为 `535F3461DDF7CDF29CEFB428EB70DDA92E693604CC98D9A58A701075A18C3158`。

## 授权前检查清单（只读，可先执行）

| 检查 | 读路径 | 写路径/高影响动作 | 通过断言 |
|---|---|---|---|
| 用户发布授权 | 项目经理授权记录 | 无 | 明确写明“TapTap Worker-only 切换”，不含 API/3001、补跑或发版 |
| 单 hunk 基线 | 批准的干净 checkout、`worker/src/worker.js` | 无 | 与 `v005` 基线比较只差 cursor hunk；没有 pause/cancel、BigPlayer observation 等 diff |
| 候选签名 | `.temp/taptap-cursor-release-candidate-20260920/candidate-worker-release/` | 无 | entry 与 manifest hash 等于本 Runbook 所列值；隔离 `verify-worker-release.js` PASS |
| WinSW 来源 | `C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback\PublicOpinionApi.exe` | 无 | 非 reparse point，SHA-256 为 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` |
| 当前 Worker 回滚基线 | `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe/.xml`、当前 Worker release/manifest | 无 | XML id 为 `PublicOpinionWorker`，entry 指向当前 Worker release，hash/状态已记录 |
| API/3001 不变基线 | `C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe/.xml`、API service 状态、3001 service 状态 | 无 | 记录 API wrapper/XML SHA-256、`PublicOpinionApi` 和 3001 的状态/PID；本 Runbook 后续不得改变它们 |
| Worker-only preflight | `verify-worker-only-cutover-plan.js` 的候选/回滚/API 输入 | 无 | 输出 `status: PASS`，`apiUntouched` 两个 hash 与前置快照相同 |

授权前只读示例（**授权后执行；无服务控制**）：

```powershell
node scripts/windows-services/verify-worker-only-cutover-plan.js `
  --candidate-release .temp/taptap-cursor-release-candidate-20260920/candidate-worker-release `
  --source-root . `
  --candidate-win-sw .temp/taptap-cursor-release-candidate-20260920/candidate-winsw-source.exe `
  --rollback-wrapper .temp/taptap-cursor-release-candidate-20260920/worker-only-rollback-material/PublicOpinionWorker.exe `
  --rollback-xml .temp/taptap-cursor-release-candidate-20260920/worker-only-rollback-material/PublicOpinionWorker.xml `
  --api-wrapper C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe `
  --api-xml C:\ProgramData\PublicOpinion\services\PublicOpinionApi.xml
```

## 经授权后的受控发布步骤

每一步均需要项目经理记录时间、操作者、命令输出和前后 hash。任何断言失败立即进入“失败路径”，不得尝试补跑或改动 API。

| 步骤 | 授权后动作 | 可读路径 | 可写路径/高影响动作 | 后置断言 |
|---|---|---|---|---|
| 1 | 创建干净 TapTap-only checkout，并重新应用已审计单 hunk | 批准基线、`v005` hash | 仅隔离 checkout | diff 仅为两行→一行 cursor 修改；定向 2/2 测试 PASS |
| 2 | 构建新的不可变 Worker release | 干净 checkout、WinSW source | **新的** `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-<id>`；不得覆盖旧 release | `build-worker-release.ps1` 成功；运行包 manifest 复算；entry hash 与候选一致 |
| 3 | 保存 Worker-only 回滚快照 | 当前 Worker wrapper/XML/release/manifest、当前 service 状态 | 经批准的新 Worker 专用备份目录；不得写 API backup | 快照包含 wrapper、XML、release 路径、manifest、hash、状态；所有 API hash 再次相同 |
| 4 | 渲染候选 Worker wrapper/XML 并执行 Worker-only preflight | 新 release、只读 WinSW source、Worker config | 独立 staging/候选 Worker service 工件；不得写 API service root | LocalService、entry、BUILD_SHA、ACL、readiness 与 API hash 都通过 |
| 5 | 短暂停机切换 | 仅 `PublicOpinionWorker` 及其候选工件 | **仅 Worker** stop/install/start；不得调用 API/3001 命令 | Worker 恢复 Running，entry/BUILD_SHA 指向新 release；API/3001 hash、PID、状态与步骤 1 一致 |
| 6 | 只读观察 | Worker 日志、run/checkpoint/content 只读查询 | 无 | 只观察下一次自然频率触发：checkpoint 从安全 cursor 续跑、无重复新增；不以 HTTP 200/completed 代替数据证据 |

步骤 2–5 只能在第二次明确的“现在允许切换 Worker”授权后运行。候选 `.temp` 包只用于比对，不能直接作为 ProgramData 运行包；必须从干净 TapTap-only checkout 重新构建并重新验签。

## 必须先补齐的自动失败回滚门禁

当前仓库**没有**可安全执行的 Worker-only切换/自动回滚器：`install-services.cmd /apply PublicOpinionWorker` 的失败分支会处理当前 Worker 工件但不先保存已验证的 Worker-only snapshot；`rollback-services.cmd` 会同时影响 API/Worker，明确禁止使用。因此在步骤 5 前必须由负责人提供并验收一个单 Worker 事务包装器，至少满足：

1. 切换前原子记录并只读保存当前 `PublicOpinionWorker.exe`、`.xml`、release 路径、manifest/hash、SCM 状态；拒绝 API 路径。
2. 对所有输入做 non-reparse、固定 WinSW SHA、候选 manifest/BUILD_SHA、LocalService、候选 entry、API hash 快照校验；任一失败时尚未停止 Worker。
3. 仅停止 `PublicOpinionWorker`；在新 wrapper/XML/render/install/start 的每个失败点，自动恢复刚保存的 Worker wrapper/XML 和旧 release 引用，重启旧 Worker。
4. 回滚后复核旧 Worker 的 service state/entry/hash，以及 API/3001 的 service state/PID/hash 完全不变；任一不一致即中止并升级。
5. 不接受 API XML/manifest、`PublicOpinionApi` service name、3001 service name、数据库操作或 manual sync 参数；日志仅写经批准的审计目录，不含 Token/凭据。

在该包装器隔离测试通过前，步骤 5 是硬阻塞，不能以人工执行 `install-services.cmd` 或全局 rollback 替代。

## 失败路径（授权后）

1. 在构建、manifest、WinSW hash、ACL/readiness 或 API 快照门禁失败：不停止 Worker；记录错误并删除**本次新 staging/release**（仅在已授权的受控清理范围内），保留旧 Worker 和所有 API 工件。
2. 在 Worker 切换后但健康断言失败：由已验收的 Worker-only事务包装器自动恢复步骤 3 的 wrapper/XML 与旧 release，再启动旧 `PublicOpinionWorker`。
3. 回滚后 API/3001 任一 hash/PID/state 变化、或旧 Worker 未恢复：停止继续操作，保留证据并升级项目经理；禁止使用全局 rollback、禁止补跑。

## 不可执行动作与剩余阻塞

- 本 Runbook 不授权任何命令；本轮仅文档。
- 仍缺已隔离验收的 Worker-only 事务切换/自动回滚包装器。
- 仍需要新的用户发布授权和切换时点授权。
- 需要一个批准的干净 TapTap-only checkout/commit，不能从当前共享脏工作树构建。
- 成功切换不等于“今日内容恢复”；BigPlayer 今日缺口仍是独立故障，不随本 Runbook 关闭。
