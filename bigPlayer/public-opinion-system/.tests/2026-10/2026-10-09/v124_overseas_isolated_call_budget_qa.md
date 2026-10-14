# v123 海外隔离逐调用持久预算独立 QA

Status: `ISOLATED_CALL_BUDGET_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅验证 v123 冻结包的 manifest 前后完整性和 `--isolated-call-budget` 闭包。未运行旧矩阵、受限 proof、生产任务、真实 HTTP、真实 AI、通知或国内现役基线；未修改业务代码、生产配置、任务或数据。自有隔离 MariaDB 使用 13316，结束后实例停止、端口释放。

## 原始证据

冻结 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-ghwuaG/scheduled-freeze-manifest.json`，SHA256 `bb86eb5e404806f4ca5e9fc5a17fefba4ae7adbaae1c8a7c04d8e900108c1326`，inventory `688` 文件。

| 阶段 | 原始文件 | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.tests/2026-10/2026-10-09/v123_manifest_preverify.raw.txt` | `775abcbd304b9d8ffa2a9acea39c3d4e72deb80a7108ab9b0c0cdd04142c56fb` | `{"verified":true,"files":688}`，exit 0 |
| 隔离预算 | `.tests/2026-10/2026-10-09/v123_isolated_call_budget.raw.txt` | `1794c919848664ca3b8e5e0a49f4795f8fb336e741304ccadb398cd24d7715ea` | exit 0，`PASS_ISOLATED_PERSISTENT_CALL_BUDGET` |
| 后 verify | `.tests/2026-10/2026-10-09/v123_manifest_postverify.raw.txt` | `775abcbd304b9d8ffa2a9acea39c3d4e72deb80a7108ab9b0c0cdd04142c56fb` | `{"verified":true,"files":688}`，exit 0 |

隔离结果目录：`.temp/overseas-real-db-03BdEi`；`serverStopped=true`、`portReleased=true`、`productionTouched=false`。结果中 `realAiExecuted=false`、`realNotificationExecuted=false`，`newNodeVerified=true`、`fakeCommitUnknownVerified=true`、`reserveCommitUnknownVerified=true`。

## 闭包结果

实际通过的 13 项：durable reserve、同 callId 不产生第二 receipt、末额度并发、store 重建后持久计数、fake consume 原子 disabled outbox、消费重放拒绝、reserve 后 fingerprint 漂移不消费不退款、全局 cap 变化拒绝、新 Node 持久计数、fake commit ACK unknown 不重放、receipt getter 拒绝、reserve commit ACK unknown 不产生第二 receipt、disabled source 拒绝。

特别边界：第二 fixture 使用显式合成日桶 rekey 以创建新隔离场景，不是真实跨日验证，也不是业务重置能力。translation、完整逐字段漂移矩阵、父聚合和生产消费者未交付/未验证。

## 静态复审

- `server/src/db/overseasIsolatedCallBudget.js`、`scripts/overseas-isolated-call-budget-checks.js`、`scripts/overseas-isolated-mariadb.js` 均 `node --check` 通过。
- 调用检索显示预算模块只由隔离检查脚本引用，未接入 `server/src` 或 `worker/src` 的生产入口；`productionActivationAllowed=false` 保持。
- 模块固定 global→scope 锁序、事务提交异常返回 `ISOLATED_CALL_COMMIT_UNKNOWN`、重复 callId 不产生可消费 receipt；但这些结论限于隔离 fixture SQL，不能升级为现役预算/outbox 或真实 AI 消费证明。

## 结论

v123 在隔离 13316、合成 manifest/fixture SQL 范围内通过，结论为 `ISOLATED_CALL_BUDGET_PASS`。整体海外真实采集仍 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；不得据此放行生产、恢复任务、翻译、完整漂移、父聚合或通知链路。
