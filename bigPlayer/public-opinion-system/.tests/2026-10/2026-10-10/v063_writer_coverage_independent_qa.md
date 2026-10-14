---
last_updated: 2026-10-10
status: independent-isolated-partial-pass
owner: 独立测试负责人
production: HOLD
---

# v063：v078 旧 writer 最小覆盖独立验收

结论：**PASS_INDEPENDENT_ISOLATED_WRITER_COVERAGE_PARTIAL_SCOPE，5 个唯一场景组通过。现役 loaded 未确认，生产继续 HOLD。**

按经理/开发交接及 v062 intake 独立编写断言、实际运行；未将开发95mock、4SQL组或审查PASS代签。只验证新增拒绝入口、producer接线、私有事务授权及指定consumer正向，不复跑 v069/v072/v075 或三站矩阵。

## 身份和执行

- 正式索引：`.Codex/docs/2026-10/2026-10-10/v078_writer_coverage_candidate_manifest.json`；已读交接 `v079_writer_coverage_development_handoff.md`。
- 完整候选：仓库根 `.temp/risk-normalization-20261010/candidate-writer-coverage-v078/manifest.json`。
- SHA256：`64c030e83c911f6af46fb33baf662825de0ab169c2cc4a077afac0c804051f6e`。
- 五树：API401、collection413、analysis413、overseas412、translation413，共2052文件；24包内变化、1独立scriptOverlay、3既有schema。每轮开始核验完整文件/schema/独立脚本及manifest，最后成功轮及汇总再次核验，均与冻结身份一致。
- 独立脚本：`.tests/2026-10/2026-10-10/v063_writer_coverage_independent_sql.cjs`；隔离生命周期和汇总器在仓库根 `.temp/qa-v063-harness/`。
- SQL fixture：现代board列；启用合成source/game/community；空关键词规则和空翻译预算fixture表供实际caller查询。没有生产DDL或真实预算/规则数据。

运行命令（本项目目录）：

```powershell
node '.tests/2026-10/2026-10-10/v063_writer_coverage_independent_sql.cjs' --isolated --candidate 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-writer-coverage-v078/manifest.json' 64c030e83c911f6af46fb33baf662825de0ab169c2cc4a077afac0c804051f6e
```

续验支持 `--only 2,3,4,5`、`--only 3,4,5`，已通过组不重复。五个唯一组由多个保留原件汇总，不声称单轮5/5。

## 独立结果

| 组 | 实际断言 | 结论 |
|---|---|---|
| 1 旧入口提前拒绝 | 五份真实Repository加载；旧analysis insert/cache/finish、旧translation direct/complete/finish拒绝，非指定analysis存在的claim/freeze/commit/fail/deep/replay与非指定translation claim拒绝；指定analysis伪audit/deep conn拒绝；三包Q1四直接方法、off/shadow/enabled×scheduled/manual、两包非指定daily/shared消费及两包非指定translation worker直接入口；独立脚本claim/save拒绝。99次明确错误码拒绝，poison DB/AI访问计数0；scheduled enabled原skip保留3次 | PASS |
| 2 API/shared producer | 实际API导出handler，用内存POST请求触发reanalyze，返回409，完整content/job/result/cache/audit ledger不变；无HTTP监听。实际collection enqueueDailyAnalysis→persistent enqueueOnly→同包repo安全入队，pending1、provider0。API/collection/analysis三条实际翻译入队：F2保旧active全部字段，旧caller fingerprint明确拒绝；借真实外事务不begin/commit/rollback/release，外部看不到未提交job，外rollback移除job且连接继续可用 | PASS |
| 3 唯一analysis正向与撤权 | 真实外conn虽已begin也不能调用split insert。合法freeze→commit提交analysis/cache并完成job；提交后原conn调用insert/cache/auditcallback/deep均拒绝且callback不执行。实际analysis worker.processPersistentAnalysisJobs→同包repo→冻结/事务提交，以精确source和时间窗限制一条合成正文，fake分析provider1次，analyzed1、completed、通知0 | PASS |
| 4 授权异常回收/实例绑定 | 真实audit INSERT trigger故障，analysis/cache/job/quality/audit ledger全回滚；异常后原conn四接口拒绝。合法事务授权开启期间，另一Repository实例不能借同conn写analysis；原实例正常提交，finally后仍撤权 | PASS |
| 5 唯一translation正向 | API安全入队→实际translationWorker.runControlled指定jobId→同包repo及translation helper，fake provider1次，completed1、译文当前fingerprint，retryable/failed/leaseLost均0 | PASS |

组1的零副作用是对本次调用的DB/provider访问计数，不是对任意恶意JS/原始SQL的安全沙箱声明。组2/API没有真实HTTP，handler中的查询/入队使用隔离实际Repository。没有修改候选source或用mock SQL替代真实SQL正向/故障断言。

独立scriptOverlay只含一份脚本，并非可独立启动的完整项目。组1执行冻结源码的VM模块，审计/normalizer两项本地依赖采用禁止调用的测试占位；验证三个导出写方法在使用依赖前拒绝。**未验安装后该CLI main、真实Q1 cmd启动或服务main**，不把VM证据标成现役脚本已阻断。actual analysisWorker包装入口→worker的映射沿开发交接静态链；QA实际执行受影响worker消费函数，没有启动常驻循环。

## 原件、续验和fixture修正

汇总：仓库根 `.temp/qa-v063-writers-summary.json`，SHA `6d8ff91b7d74ee7aac7c1b52eaad88a58c51fa9ee576326e6a2e36f0cfde874d`。汇总器核每个run候选身份、收尾、通过组以及最终require.cache路径/SHA属于完整manifest，并再次逐文件核验。

| run目录（仓库根.temp下） | 原件结果与原因 | SQL端口 |
|---|---|---|
| qa-v063-writers-jHSNtg | 组1组装失败：QA误选overseas内不存在的normalizer依赖，MODULE_NOT_FOUND；修为禁止调用的测试占位。不是候选业务FAIL | 61855 |
| qa-v063-writers-j1AU6i | 组1PASS，组2停止：通用fixture缺po_keyword_rules；补空fixture表后只续2/3/4/5 | 62011 |
| qa-v063-writers-x0DQOR | 组2PASS，组3 worker正向断言失败，原件初次仅记录assert；后续定向诊断 | 62319 |
| qa-v063-writers-rqWzNy | 仅续3/4/5；组3 workerProbe证fakeprovider1次，但fake分析结果漏必填modelName，job fail为ER_BAD_NULL_ERROR；补齐假provider输出，无候选改动 | 62758 |
| qa-v063-writers-9BOifj | 仅续3/4/5，三组全部PASS，exit0，候选前后身份一致 | 62968 |

各目录均保留result.json、owner.json、fixture.env、init/server log和datadir；不转录隔离随机凭据。失败原件不删除、不改写；不能将上表前四run整体说成PASS。最终唯一组聚合1来自j1AU6i、2来自x0DQOR、3/4/5来自9BOifj。

最后成功轮记录并独立匹配606条require.cache路径/SHA，证明**该隔离QA进程**加载的模块属于候选。该轮只执行3/4/5，因此不声称606条cache独自覆盖组1/2的API handler/Q1加载；组1/2的实际调用证据来自各自原件和冻结脚本。早期退出未保存完整cache，是证据粒度限制，非生产loaded证明。

所有实例MariaDB10.4.14、serverId20261101、随机独立datadir、loopback、no-defaults、event scheduler OFF、fixture表CRUD账号；每次shutdown前核port/serverId/datadir/pid_file/PID/runner身份，五run均identityBeforeShutdown/serverStopped/portReleased=true。额外查询上述五端口无监听。未接生产DB，未改ACL/服务/任务/环境，未抓取/真实HTTP/付费AI/通知；未改业务代码或经理待办，未push/发布。新增QA脚本与报告，辅助原件仅仓库根.temp。语法及尾空白/冲突标记检查通过。

## 生产与未覆盖边界

现役身份材料为开发此前只读采样，身份manifest SHA `eca9cb52fd2460d01d7223a177828a3db45b6b0a37e74fd64e01a254b68ab34c`；QA没有新采样或内存读取。全部现役loaded模块仍UNKNOWN，translation安装包ACL拒读继续保留。Running、命令行、磁盘SHA、隔离require.cache各自只证明对应观测，不能互相代替。

actual Q1任务仍指项目旧入口，未真实停用/替换；analysis dailyRunner额外启动、各旧进程重新启动、独立脚本main/安装路径仍需运行控制方案。候选文件安全不表示当前生产入口已升级，更不表示只存在一个consumer进程。本次不复测既有analysis/translation完整身份矩阵、overseas页面事务、schema回退、双gate排空或通知窗口。

经理可收口本项**隔离最小覆盖部分PASS**；开发下一步仅准备精确升级/禁止再起/双gate排空/回退方案，不据本报告执行切换。通知抑制、生产schema/配置/名单/cutover和真实定时恢复仍未完成。生产HOLD，本报告不授权现役操作。
