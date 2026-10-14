---
last_updated: 2026-10-10
status: independent-combination-partial-pass
owner: 独立测试负责人
production: HOLD
---

# v065：统一后端 v089 独立组合验收

结论：**PASS_INDEPENDENT_ISOLATED_COMBINATION_PARTIAL_SCOPE，新增两条组合衔接2/2一次通过；全量组合来源与SHA核验通过。生产继续HOLD。**

按经理与开发派单独立编写断言、执行实际导出内存API handler及自有真实SQL。不用开发2PASS或历史分项PASS代签。仅核组合身份、两个新增producer-consumer衔接和两个未变guard代表性断言；不复跑v064/v063/v069/v072/v075/v078/v087旧矩阵、其他树行为或三站。

## 身份和基底

正式索引 `.Codex/docs/2026-10/2026-10-10/v089_unified_backend_candidate_manifest.json`，交接 `v090_unified_backend_combination_development_handoff.md` 已读。

完整候选位于仓库根 `.temp/risk-normalization-20261010/candidate-unified-backend-v089/manifest.json`，SHA256 `99ace6cc9c3c040aa8eab3d548e002a7fc9a74503a19aed910feb5ca2fc35cc2`。API来源manifest必须为v087 `77e485dc719bf758c599acc1fb5f9e7ede2f2bc5964fdc1e879a239cbb89c230`；其他来源必须为v078 `64c030e83c911f6af46fb33baf662825de0ab169c2cc4a077afac0c804051f6e`。没有修改冻结manifest的development-pending字段。

| 对象 | 独立核验 |
|---|---|
| API401 | 完整路径集合及每文件SHA与v087完全相同；不能用v078旧API替换 |
| collection413、analysis413、overseas412、translation413 | 各完整路径集合及每文件SHA与v078对应树完全相同 |
| standalone script1 | 路径/SHA及实际字节与v078一致，保持不完整overlay边界 |
| schema3 | SHA集合及实际字节与v078一致，没有新增schema |
| README、dependency-inventory | 按组合manifest核artifact SHA；依赖清单SHA为c0e5c32a020ee56f832d1ec189df55cd9781dc509d04facaa708ffa4596010e6 |

共2052运行文件，独立遍历实际目录，排除遗漏/多余文件；逐文件核目标和来源实际字节。运行前、成功后均执行相同身份核验，包含来源manifest、五源树、script/schema/artifact。businessSourceChanged=false。API的app/login client/connector/sources代码原字节来自v087，沿用v064已签保护；本轮还实际核同一login client对象，未重跑sources行为矩阵。

440相对require解析及32JS语法是开发构建记录；本轮核依赖清单冻结身份、实际加载链及QA脚本语法，不将开发全量解析/语法检查称为独立重复执行。collection/overseas只签字节组合身份，非本轮新行为PASS。

## 新增独立组合断言

脚本 `.tests/2026-10/2026-10-10/v065_unified_combination_independent_sql.cjs`；生命周期位于仓库根 `.temp/qa-v065-harness/lifecycle.cjs`。SQL使用已有通用fixture与三既有隔离schema，现代board列、空规则/预算辅助表，显式启用fixture game/community。没有生产DDL。

```powershell
node '.tests/2026-10/2026-10-10/v065_unified_combination_independent_sql.cjs' --isolated --candidate 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-unified-backend-v089/manifest.json' 99ace6cc9c3c040aa8eab3d548e002a7fc9a74503a19aed910feb5ca2fc35cc2
```

| 组 | 实际断言 | 结果 |
|---|---|---|
| 1 API→analysis | actual handler reanalyze202，返回content/job ID与真实pending任务一致；actual原analysis worker消费函数领取、freeze、事务提交，fake分析1次且正文/指纹匹配，原job完成、result1/cache1指纹一致、成功audit1、通知0；connector与app login client为同一对象；未变API finishAnalysisJob和claimTranslationJobs代表性guard仍拒，query/pool属性访问0 | PASS |
| 2 API→translation | actual API Repository安全入队，actual原translationWorker.runControlled指定job ID，fake翻译1次；唯一job完成、唯一译文的指纹/版本/内容匹配，retryable/failed/leaseLost均0 | PASS |

组1getContentTree采用当前真实fixture节点查询adapter，一次调用，不签整树扩展。API handler无listener，无真实HTTP或认证。组2仅Repository producer，没有新增或验收翻译HTTP接口。两个worker是实际受影响导出函数，不启动resident main/无限循环。

没有重新调用旧九方法矩阵、Q1/daily矩阵、字段保护或海外采集；两个代表性guard配合全包原字节来源证明未发生代码回退，不能证明实际生产入口被禁用。

## 原件和收尾

独立原件：仓库根 `.temp/qa-v065-combination-IGZa1o/result.json`，SHA256 `0b0126470e12755ed264586403163190cb28c25bf222b8d1aa395d2d03cf9e7f`。2/2一次PASS、exit0，无FAIL续验。同目录保留owner.json、fixture.env、init/server log与datadir，随机隔离凭据不转录。

402条实际隔离require.cache路径/SHA逐项匹配组合manifest，包含API/analysis/translation实际加载链；它只证明本次QA进程。collection/overseas未为本轮行为测试加载，不将完整文件哈希冒充其loaded证明。

自有MariaDB10.4.14、serverId20261121、loopback端口64785、随机独立datadir、显式no-defaults、event scheduler OFF、fixture表CRUD账号。shutdown前核port/serverId/datadir/pid_file/子进程PID/runner身份，identityBeforeShutdown/serverStopped/portReleased=true；另查64785无监听。2052文件及来源/schema/script/artifact前后一致。

QA脚本syntax及尾空白/冲突标记检查通过。只新增QA脚本/报告与仓库根.temp辅助原件；未改业务源码、经理待办、生产配置或数据，未服务/任务/ACL操作、部署/push/发版，未真实HTTP/认证/采集/AI/通知。

## 明确未包含

现役loaded/resident main、translation归档ACL读取修复、控制器实际live adapter、旧Q1/manual/script真实禁止再起、双gate实际准入、生产schema/配置/精确名单/切换、通知抑制、境内真实回归及境外真实定时恢复均未覆盖或未完成。没有新增生产观测，不能据此宣称线上已升级或定时同步恢复。

本结果仅收口统一源码候选组合部分PASS；它不是生产切换执行器，不解除HOLD。经理安排下一精确缺口，开发按既有门禁准备后续工件。
