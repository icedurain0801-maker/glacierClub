# v135/v137 祖先 current 锁原语与非空父回归独立 QA

Status: `ISOLATED_ANCESTOR_LOCKS_PARENT_REGRESSION_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅验证冻结包的 692 文件完整性、祖先 current 锁原语和非空两 post/空 comments 父回归。未运行旧矩阵、恢复 proof、生产、真实 HTTP/AI/通知或国内现役基线；不把本批提升为 parent comment 祖先完整链或 membership 动态插入闭包。

## 原始证据

冻结 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-cA52qM/scheduled-freeze-manifest.json`，SHA256 `fbc7cbf7d5736a24fd88c953d93824fb511c7a59bacf806ee1b3a476cfc66845`，inventory `692` 文件。

| 阶段/场景 | 原始文件 | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.tests/2026-10/2026-10-09/v138_manifest_preverify.raw.txt` | `002c3024c4d2c4d629c412c34850cead35d92cc61393453039bbe2be17c08e71` | `verified=true, files=692`，exit 0 |
| ancestor locks | `.temp/overseas-real-db-tmyZXL/result.json` | `2a8b57be8a9e1e07406b90b0dce2535e0b19a279595b5c620bb023b3712e0d4b` | exit 0，`PASS_ISOLATED_ANCESTOR_LOCK_PRIMITIVE` |
| parent nonempty | `.temp/overseas-real-db-Hx0WEb/result.json` | `857f54f282b0047a06c7d4ffa23df8395d61b75ee175651a787983297068bbd5` | exit 0，`PASS_ISOLATED_PARENT_NONEMPTY_POSTS` |
| 后 verify | `.tests/2026-10/2026-10-09/v138_manifest_postverify.raw.txt` | `002c3024c4d2c4d629c412c34850cead35d92cc61393453039bbe2be17c08e71` | `verified=true, files=692`，exit 0 |

两次隔离运行均 `serverStopped=true`、`portReleased=true`、`productionTouched=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`。

## 结果

祖先锁原语五项通过：RR 旧快照与 current 锁拒绝已提交删除 root；历史 depth2 中间 row 的 distinct writer 在排序 current 锁持有期间收到 `ER_LOCK_WAIT_TIMEOUT`，释放后可写；discovery/current reference drift 拒绝且不自适应加锁；`content_depth=null` 与 `is_deleted=null` 均拒绝。结果明确 `historicalAncestorsNotRunLinked=true`、`parentFinalizeChainExecuted=false`、`membershipConcurrencyVerified=false`。

非空父回归通过：两站合计两个 post（每站一条）、comments 空，`discovered=2`、`stored=2`，父完成并发布 certified window-end cursor；结果明确 `ancestorConcurrencyVerified=false`、`membershipConcurrencyVerified=false`。

口径修订：此前“每站两个 post”表述与 `Hx0WEb/result.json` 原件不一致，已更正为每站一条、两站合计两条；未重跑测试，未修改冻结包或 result 原件。

## 静态复审与未覆盖

`overseasAncestorEvidenceLocks.js`、`overseas-isolated-ancestor-lock-checks.js`、`overseasScheduledParentStore.js`、`overseas-isolated-parent-checks.js` 均 `node --check` 通过。新增原语尚未接入完整 parent comment 链；未覆盖祖先 comment 全链、membership 动态插入、全部失败/全字段、cursor anchor、恢复/epoch2、真实连接器/AI/通知。

## 结论

本批在隔离 SQL 范围内通过，结论为 `ISOLATED_ANCESTOR_LOCKS_PARENT_REGRESSION_PASS`。整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；owner 已停止并释放实例，祖先锁只作为原语局部证据，不构成真实采集放行。
