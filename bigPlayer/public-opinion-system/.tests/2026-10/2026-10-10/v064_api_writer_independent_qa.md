---
last_updated: 2026-10-10
status: independent-api-only-partial-pass
owner: 独立测试负责人
production: HOLD
---

# v064：当前 login-auth-fix 基底 v087 API writer 独立验收

结论：**PASS_INDEPENDENT_ISOLATED_API_ONLY_PARTIAL_SCOPE，4/4 独立组一次通过。基底保留独立静态核验通过；生产继续 HOLD。**

依据经理、开发交接及正式 v087/v088 工件，独立编写断言，实际运行导出内存API handler与自有SQL。开发4/4及静态结果不代签；未重v069/v072/v075/v078矩阵、其他运行树或三站。没有生产或外部服务操作。

## 冻结身份与基底保留

完整候选：仓库根 `.temp/risk-normalization-20261010/candidate-api-writer-v087/manifest.json`，SHA256 `77e485dc719bf758c599acc1fb5f9e7ede2f2bc5964fdc1e879a239cbb89c230`。正式索引 `.Codex/docs/2026-10/2026-10-10/v087_api_writer_reintegration_candidate_manifest.json`、交接 `v088_api_writer_reintegration_development_handoff.md` 已读。完整manifest中development-pending字段属于冻结原件，不覆盖它来写QA状态。

独立读取归档zip、核zip SHA `04f37a0c5a22bc6020dc3063b83f022e18c4d65c290258edf9e6e650ccd0b25b`、archive manifest SHA `8f023f22a787b7d74c8478bac664f9cd0c4d2c2ced9e4e0371958a06a876390e`。逐归档条目与401候选文件比对：396基底文件全部保留，394原字节未变，只有app.js和repository.js两个修改；5新增helper逐字节匹配冻结v078 API原件。schema0、API单树。包括connector、aiAnalyzer、alertEngine、normalizer在内的其余基底文件未变。

静态脚本和结果：仓库根 `.temp/qa-v064-harness/base-preservation.ps1`、`base-preservation-result.json`。没有解压到现役目录，没有读取生产环境或当前进程。已读候选diff直接变化：app仅reanalyze安全冲突409及必要错误映射，repo仅两种safe enqueue、helper接线与9个旧入口拒绝；login/sources代码保留。helper虽含其他内部定义，本候选未新增API capture/replay/repair能力。

## 独立执行

正式脚本：`.tests/2026-10/2026-10-10/v064_api_writer_independent_sql.cjs`；自有SQL生命周期 `.temp/qa-v064-harness/lifecycle.cjs` 位于仓库根。使用既有通用SQL schema和QA fixture helper，显式启用fixture game/community，未增加生产schema。

```powershell
node '.tests/2026-10/2026-10-10/v064_api_writer_independent_sql.cjs' --isolated --candidate 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-api-writer-v087/manifest.json' 77e485dc719bf758c599acc1fb5f9e7ede2f2bc5964fdc1e879a239cbb89c230
```

一次运行，4/4 PASS、exit0，无FAIL或续验。

| 组 | 独立实际断言 | 结果 |
|---|---|---|
| 1 登录基底和sources | connector.loginSessionClient与app导出对象严格同一；实际handler详情为对象、列表为数组且唯一fixture来源；缺来源404/SOURCE_NOT_FOUND；路径与sourceId冲突400/INVALID_INPUT；错误game scope404；nested login-status正确绑定source/account并调用fake一次；connector登录不可用仍authorized=false、reason=LOGIN_SESSION_CLIENT_UNAVAILABLE | PASS |
| 2 分析入队 | actual handler reanalyze返回409/ANALYSIS_JOB_LEASE_ACTIVE，完整content/job/result/cache/audit ledger不变；真实正文F2入队保原running job全部字段；旧caller指纹拒绝且ledger零写；真实borrowed transaction内新job可见、外连接不可见、helper生命周期0；外rollback移除job且conn继续可用 | PASS |
| 3 翻译入队 | 真实海外fixture正文F2仍保旧active任务15字段，旧caller指纹明确拒绝且任务不变；borrowed transaction新job内可见外不可见，生命周期0，外rollback移除job且conn继续可用 | PASS |
| 4 旧API入口 | 9个实际存在方法均抛预期错误；query/pool采用getter trap，连属性访问也不得发生，访问计数0；不进入结果写入或消费流程 | PASS |

9个方法：insertAnalysis、upsertAnalysisCache、finishAnalysisJob、claimAnalysisJobs、_claimAnalysisJobsOnce、upsertContentTranslation、completeTranslationJob、finishTranslationJob、claimTranslationJobs。未发明不存在的API方法，也未重测其他runtime。

实际sources查询使用候选Repository；账号列表adapter执行真实隔离SQL按source及实际传入的game/platform过滤，3次fixture账号查询，不返回虚构空账号。无关listSourceCapabilities/getSyncStatus/getSourceSyncStatusSummary/getAccountCredentialSummary使用空数组测试替身；不声称覆盖真实能力、同步/凭据汇总。reanalyze的getContentTree替身查询当前真实fixture正文，仅测试当前节点，不覆盖树扩展。嵌套login-status仅fake，connector安装状态与requestJson为synthetic unavailable替身；没有真实登录/认证。handler无listener，未发HTTP请求。

## 原件和收尾

运行原件：仓库根 `.temp/qa-v064-api-6cJmo3/result.json`，SHA256 `111fa057a14ae8a2b8cd103ea0ab54c0d9c4408c15fffc86f181d501d1b58ba2`。同目录保留owner.json、fixture.env、init/server log和datadir，不删除原件、不转录隔离随机凭据。

401完整文件、manifest前后哈希一致；137条实际隔离require.cache路径/SHA逐项匹配完整candidate manifest，包括app、Repository、login client、connector和本轮helper。只证明本次隔离QA进程加载对象，不能代替当前现役loaded/main。

MariaDB10.4.14，serverId20261111、loopback端口61571、随机独立datadir、显式no-defaults、event scheduler OFF、仅fixture表CRUD用户。关闭前核port/serverId/datadir/pid_file/子进程PID/runner身份后SHUTDOWN；identityBeforeShutdown/serverStopped/portReleased均true，进程exit0；另查61571无监听。未启HTTP服务。syntax和尾空白/冲突标记检查通过。

本轮只新增QA脚本/报告和仓库根.temp辅助原件。未改业务代码、经理待办、生产配置/DB、ACL、服务或任务；未部署/push/合并/发版；无真实HTTP/认证/采集/AI/通知。

## 签署边界

本报告只签当前login-auth-fix归档基底上v087 API-only重叠变化。API安全producer可用、旧consumer接口拒绝，不说明其它包已升级、指定consumer生产可用或Q1已阻断。API候选不是全量切换包。

现役loaded/main UNKNOWN、translation归档ACL拒读、双gate实际准入、旧Q1/manual/script禁止再起与生产schema/配置/名单/cutover仍未完成；境内采集真实回归、境外实际定时恢复未验收。没有新增生产观测，沿用交接中的未完成状态。通知抑制不在本轮范围。

请经理收口API-only独立部分PASS并安排下一精确缺口；开发保留当前登录基底，按既有门禁准备后续工件。本报告不授权生产切换或解除HOLD。
