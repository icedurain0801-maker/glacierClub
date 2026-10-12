# 海外未首次claim任务的receipt恢复候选

Status: partial-first-scope-frozen / developer-97-PASS / independent-QA-pending / RUNTIME_NO_GO

新增显式recoverManualFirstRunBindings与createRecoveredIsolatedOverseasCandidateDeps。只按指定requestIds从真品牌reader恢复receipt；同manifest、全站只读对账accepted后，再RR READ ONLY快照核对全部scope/window/确定性IDs及queued、attempt0、epoch0、无owner/lease/retry/start/finish。只恢复owner-free首次scope，交原factory；actual runSource仍必须claim CAS成功、持久owner/epoch1/attempt1/live并prepare后Journal与网络门禁。无目录扫描、无新receipt、无自动claim/HTTP、无默认main激活。

仅支持从未claim的queued任务重建首次权限。曾claim缺Journal、epoch>1或部分站点已执行拒绝整请求，仍需后续恢复设计；读快照不是独占锁。待故障矩阵/集成证据/冻结QA，不宣称已跨进程执行采集。

验证：manual18tests与mainchain10tests联合28/28；实际恢复bindings→模拟persisted首次claim ACK→actual manager+真Journal发布并新manager读exact epoch1；epoch2缺证拒绝。原factory显式恢复组装零网络/零写。首次集成测试漏region_code被context门禁拒绝，补齐fixture后通过，未放宽门禁。员工只读实际实现无新增阻断。候选12冻结12文件97/97、641份SHA一致，manifest v087、handoff v088。

仍未完成：恢复factory到actual runSource整段E2E、新进程恢复SQL及执行、抢先claim竞态证据；mainchain旧正路径与恢复Journal分别通过不等于组合E2E。多站部分执行余量、epoch恢复、全入口独占、真实DB/HTTP/AI翻译/第二源仍NO_GO。无现役/生产操作、无commit/push/发版。
