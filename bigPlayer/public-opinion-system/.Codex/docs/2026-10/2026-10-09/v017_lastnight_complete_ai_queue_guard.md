# observe-ai 部分队列误报修复

Status: QA_PENDING / NOT_DEPLOYED。

8fcFb4 observe 子阶段 NO_GO 已撤回，不执行/采信旧成功码。仅海外独立模块修复，不改国内或现役算法。

统一闸门：queue_result 阶段、queue.status=EXACT_AI_QUEUED、remaining 数组为空；queued 数量及逐项contentId/fingerprint精确覆盖after中inserted/changed全集，after contentId、queued contentId和jobId均不得重复。拒绝缺失/额外/重复/错误fingerprint，不用集合去重掩盖问题。Recovery与Store即时观测均调用同一闸门，零changed仍明确AI未请求，不算完成。

新增部分队列/缺失/重复/额外ID与任务ID/错误fingerprint负例，以及认证journal恢复负例；invalid队列在任何分析SQL前拒绝。真实唯一索引采用经理现场事实，不再推测source-fingerprint唯一。

Store/requeue/restore的现场放行仍按独立QA分列，真实AI完成尚未取得。日完整分页、持久slot现役兼容、02独立入口仍未交付。无现场DB/外部请求/DDL/国内调度修改。

## 新独立冻结

根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-ckYn3w`，旧8fcFb4保留证据但不执行、不改旧manifest。CLI仍728a952ab5622dbc2fdab5359d0c5971b509d9dc70e8a4bf3975af538eefe05e。

| 模块 | SHA256 |
|---|---|
| lastNightProtectedStore.js | 40981b5a2706e5f700da8e59e7acc47e4c15116558dd595a3559849217cda735 |
| lastNightRecovery.js | 190a4f678d0b47e7e74fc21ef66925851b6a8bcae8d161b145e63bd51d47b2b3 |
| lastNightBoundedRuntime.js | d2fa693a5b1783dcf1095b283871dac2d36193bb4b06fd3ed3cd9ed619b3b4ea |

受影响验证：`node --test worker/test/lastNightCompleteQueue.test.js worker/test/lastNightRecovery.test.js worker/test/lastNightProtectedStore.test.js worker/test/lastNightRecoveryTransactions.test.js worker/test/lastNightBoundedRuntime.test.js` 19/19 PASS；语法/限定路径空白检查通过；新observe模板完整inventory通过。旧35/35仅来源，未冒称新全量已验。交测试负责人独立复跑。

收到旧分阶段QA v018：store/requeue/restore限定候选GO，observe NO_GO；此新包修复observe，须新独立增量结论后经理现场。完整海外链路仍未完成。
