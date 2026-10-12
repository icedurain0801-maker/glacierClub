# v132/v134 父任务集合与五终态 SHA 完整性独立 QA

Status: `ISOLATED_PARENT_INTEGRITY_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅验证冻结包的 690 文件完整性，以及 `--isolated-parent-integrity` 新增完整性拒绝模式。未运行旧矩阵、祖先 current 锁补丁、恢复 proof、生产、真实 HTTP/AI/通知或国内现役基线；本轮结束后自有实例已停止并释放 13316。

## 原始证据

冻结 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-PaZt5i/scheduled-freeze-manifest.json`，SHA256 `16dd601d61313e7cb185ab335c6f80b0b404640734f9f8f2f391caf7f5a5c637`，inventory `690` 文件。

| 阶段/场景 | 原始文件 | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.tests/2026-10/2026-10-09/v135_manifest_preverify.raw.txt` | `eb3e83127ccbd05a46b23e9c96fbc218e915cf914c424709fc4b5147414d269d` | `verified=true, files=690`，exit 0 |
| integrity SQL | `.temp/overseas-real-db-BHYW5b/result.json` | `e38ae1857ae1231897dc2826e2384c3714929e5ea8213447f4e5365a81415a8c` | exit 0，`PASS_ISOLATED_PARENT_INTEGRITY_FIELDS` |
| 后 verify | `.tests/2026-10/2026-10-09/v135_manifest_postverify.raw.txt` | `eb3e83127ccbd05a46b23e9c96fbc218e915cf914c424709fc4b5147414d269d` | `verified=true, files=690`，exit 0 |

实例结果：`serverStopped=true`、`portReleased=true`、`productionTouched=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`。

## 15 项检查

基础父收尾 8 项通过：正常两站 firstClaim proof、两 feed sealed terminal、checkpoint snapshot drift 零父写、parent owner drift 零父写、cursor non-advancing 零父写、尾部 audit fault 全回滚、并发 finalize 单赢家、parent/state/source/cursor/event 原子性。

新增 7 项通过：缺 child membership 拒绝、额外合成 child 拒绝、terminal `linksSha256`、`taskSetSha256`、`completionSetSha256`、`schemaSha256`、`contractSha256` 逐字段事前篡改拒绝；每次拒绝后父收尾五表零写，恢复原值后正常终态完成。

## 静态复审与未覆盖

`overseasScheduledParentStore.js`、`overseasScheduledAdmissionStore.js`、`overseas-isolated-parent-checks.js` 均 `node --check` 通过；新增完整性模式仅由隔离脚本调用。该模式不证明物理 child 删除、不证明 terminal 全字段、不覆盖祖先 current 锁、全部失败、非空 membership 并发、cursor anchor、恢复/epoch2 或真实链路。

## 结论

本批在隔离 fixture SQL 范围内通过，结论为 `ISOLATED_PARENT_INTEGRITY_PASS`。祖先 current 锁补丁尚未冻结、未纳入本轮 QA；整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
