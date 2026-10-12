# v140/v141 新建评论回复链与 membership FK 原语独立 QA

Status: `ISOLATED_COMMENT_CHAIN_MEMBERSHIP_PRIMITIVE_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅验证冻结包的 692 文件完整性、新建 post/comment/reply 父链和 membership FK 插入竞争原语。未运行旧矩阵、恢复 proof、生产、真实 HTTP/AI/通知或国内现役基线；不将该结果扩展为历史未 link 祖先链、parent finalize barrier 或真实采集放行。

## 原始证据

冻结 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-AeYqAH/scheduled-freeze-manifest.json`，SHA256 `262285c29d23a2d1019b2feba5ee9d2a224bbbcc2a775fd78b35165130dacd78`，inventory `692` 文件。

| 阶段/场景 | 原始文件 | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.tests/2026-10/2026-10-09/v142_manifest_preverify.raw.txt` | `0be864f2bdd55660217b52a4408c2e332f5bc14f63bff4e1fbee8c33b0ce48d5` | `verified=true, files=692`，exit 0 |
| 新建评论链 | `.temp/overseas-real-db-v3KMs1/result.json` | `707f9d20209a2c403f59a33ec706244d050d500aaa3fb91f5d4008e34cb183a0` | exit 0；两站各 post/comment/reply 一条，合计 6 unique links，4 tasks/站，父完成 |
| ancestor + membership primitive | `.temp/overseas-real-db-LDPiPI/result.json` | `eaf0e44a3b5a3423dd040c0fc60d0bacbe7e78e7ffde671f8702c6a1cb235d85` | exit 0；FK INSERT 在 content X 锁持有时超时零插入，释放后成功 |
| 后 verify | `.tests/2026-10/2026-10-09/v142_manifest_postverify.raw.txt` | `0be864f2bdd55660217b52a4408c2e332f5bc14f63bff4e1fbee8c33b0ce48d5` | `verified=true, files=692`，exit 0 |

两次隔离运行均 `serverStopped=true`、`portReleased=true`、`productionTouched=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`。

## 结果

- 评论回复链：`discovered=6`、`stored=6`，`commentReplyChainVerified=true`；中间祖先删除事前拒绝，父相关五表零写。
- membership 原语：排序 current 锁与 FK 插入竞争实际 SQL 通过，writer 收到 `ER_LOCK_WAIT_TIMEOUT` 后释放成功；结果标注 `membershipConcurrencyVerified=true`，但 scope 明确为 `primitive_fk_insert_not_parent_finalize_barrier`。
- 结果明确 `historicalParentChainVerified=false`、`ancestorConcurrencyVerified=false`、`parentFinalizeChainExecuted=false`；因此不宣称历史链或 parent finalize 竞争已闭合。

## 静态复审与未覆盖

`overseasScheduledParentStore.js`、`overseasAncestorEvidenceLocks.js`、`overseas-isolated-parent-checks.js`、`overseas-isolated-ancestor-lock-checks.js` 均 `node --check` 通过。cursor anchor、全失败、terminal 全字段、translation 预算漂移、真实持久消费/排空切换、恢复/epoch2均未验证。

## 结论

本批在隔离 SQL 范围内通过，结论为 `ISOLATED_COMMENT_CHAIN_MEMBERSHIP_PRIMITIVE_PASS`。整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，不放行真实海外采集。
