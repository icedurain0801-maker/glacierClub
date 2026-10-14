---
last_updated: 2026-10-10
status: development-and-independent-api-only-partial-pass
owner: 开发负责人
production: HOLD
---

# 当前登录修复 API 上的 writer 保护交接

基于已归档的 `release-20261010-login-auth-fix` 完成 v087 API 候选。本次只重新集成安全入队、现有旧消费/结果入口提前拒绝和必要错误映射。开发 4/4 与独立 QA 4/4 均通过；独立结论仅覆盖 API-only 隔离范围，没有生产切换，不能称境外 BigPlayer 定时同步恢复。

## 冻结交付与改动范围

完整候选 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-api-writer-v087/manifest.json`，SHA `77e485dc719bf758c599acc1fb5f9e7ede2f2bc5964fdc1e879a239cbb89c230`。正式签收索引为同目录 `v087_api_writer_reintegration_candidate_manifest.json`。原完整 manifest 的 development-pending 字段保持冻结原字节，最新签收状态只写正式索引。

API 基底归档 396 文件，本候选 401 文件：仅修改 `server/src/app.js` 和 `server/src/db/repository.js`，新增 5 份 v078 原字节 helper：`safeAnalysisEnqueue.js`、`historicalAnalysisAdmission.js`、`currentTranslationConsumer.js`、`translationIntentProtocol.js`、`shared/riskPolicyHistory.js`。其余 394 原文件逐字节保留，包括 BigPlayer connector、`aiAnalyzer`、`alertEngine`、`riskSeverityNormalizer`。没有 schema、依赖或其他运行树变更。

`app.js` 仅改变重新分析的安全入队冲突 409 响应及必要 helper 错误映射。保留现有 `loginSessionClient` 注入、GET 来源详情对象、来源列表数组、缺失 404、路径参数限制和 scope 保护。

`Repository` 的分析、翻译入队改用既有 safe helper，可借用外部事务连接。先锁当前内容再锁精确任务，拒绝过期内容指纹，保留 active job 全字段；借连接时不 begin/commit/rollback/release。9 个实际存在的旧消费/结果方法在 DB 或连接池访问前抛出明确错误。保留这些方法的原不可达正文，不增加不存在的新接口。批量入队等既有调用通过新 helper，不改其他业务行为。

5 个 helper 保留 v078 原件，包含其内部定义；本轮没有接入 current-body intent capture/replay/repair 的 API 接口、Repository 管理入口、风险规则或通知功能。

## 开发直接验证

真实自有隔离 MariaDB `10.4.14`，port `59905`、serverId `20261087`，loopback、`--no-defaults`、event scheduler OFF。测试环境不读生产凭据，禁止 fetch，不开 HTTP listener，登录会话用 fake，没有真实采集、AI 或通知。

| 组 | 执行与证据 | 结果 |
|---|---|---|
| 1 | actual 导出 API handler 内存请求；真实来源查询验证详情/列表/缺失404/路径冲突400/错误game404；connector与app共享loginSessionClient；嵌套login-status调用fake一次；connector保留登录服务不可用原因 | PASS |
| 2 | actual handler重新分析返回409，running job及相关表保持不变；真实 safe analysis 外事务入队、其他连接不可见、外rollback删job；过期指纹拒绝 | PASS |
| 3 | safe translation F2入队保留旧active全字段；旧指纹拒绝；真实借外事务生命周期访问0，外rollback删job且连接仍可用 | PASS |
| 4 | 9个既有旧方法在poison query/pool之前拒绝，DB访问0，无provider调用 | PASS |

原件：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/api-writer-v087-verification/run-5a6Lb2/result.json`，SHA `b823d611a4cee2823fd790d772cc580cddf8c399178713af18e81366437380b5`。运行前后 401 候选文件 SHA 一致；该轮 require.cache 路径/SHA 记录只证明隔离进程加载，不代表现役 loaded。关闭前核 port/serverId/datadir/pid_file/子进程PID/runner 身份后 SQL SHUTDOWN，serverStopped/portReleased=true，exit0。

先前 `run-HqsoMo` 失败是账号列表 fixture 返回空导致嵌套登录404；`run-B3WMO1` 是修fixture时误要求来源详情调用必须提供gameId，返回500。两份 FAIL 原件保留，不归因为候选缺陷。修为按来源返回真实 fixture 账号、仅核存在的额外过滤字段后本轮4/4通过，期间冻结候选未改变。

静态原件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/api-writer-v087-verification/static-review-result.json`：401 完整文件集合/SHA、396基底、2改+5新增、394保留及helper原字节一致；7JS语法、28相对require解析、新增diff空白检查通过。diff在 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/api-writer-v087-verification/candidate.diff`。只读审查确认两原文件的改动限于本轮范围，login/sources分支未改。

复现命令（仓库根）：

```powershell
node '.temp/risk-normalization-20261010/api-writer-v087-verification/test-api.cjs' --isolated --candidate '.temp/risk-normalization-20261010/candidate-api-writer-v087/manifest.json' 77e485dc719bf758c599acc1fb5f9e7ede2f2bc5964fdc1e879a239cbb89c230
```

## 独立 QA 与未完成项

请测试负责人独立写断言，只验上述 API-only 重叠直接变化；不得用开发 PASS 代签，不重 v069/v072/v075/v078 旧矩阵、其他树或三站采集。可参考开发生命周期和 fixture，fixture辅助手段单独注明。验真实 API handler 和真实隔离 SQL，登录用 fake；不真实 HTTP/采集/AI/通知。新 FAIL 保留，只续未通过组。

生产继续 HOLD：不切服务/任务、改 ACL、执行生产 DDL/数据操作、push/merge/tag。v065来源前端保护继续保留。本候选不是全量生产切换包；双 gate 真实准入、旧 Q1/manual/script 禁止再起、翻译归档 ACL 拒读和实际 loaded/main 证据缺口仍按 v083–v086 未完成状态保留。境内采集真实回归和境外实际定时恢复尚未验收。

独立 QA 完成后由经理收口并安排下一精确执行前缺口。该交付不解除生产 HOLD。

## 独立 QA 签收

正式报告为项目 `.tests/2026-10/2026-10-10/v064_api_writer_independent_qa.md`。原件位于仓库根 `.temp/qa-v064-api-6cJmo3/result.json`，SHA `111fa057a14ae8a2b8cd103ea0ab54c0d9c4408c15fffc86f181d501d1b58ba2`；已读取报告并独立核对该原件哈希、冻结候选身份和 4 个 PASS 记录。

独立一次 4/4，通过登录注入/来源保护、分析 F2 保 active 与 stale 拒绝、翻译 F2 保 active 与 stale 拒绝、两种借外事务生命周期 0/外 rollback/连接继续可用，以及 9 个旧方法 query/pool getter 零访问拒绝。真实 fixture 账号查询 3 次；能力/凭据/同步汇总空替身和 getContentTree 当前真实节点 adapter 的范围在 QA 报告明确，不签真实授权、树扩展或汇总行为。

QA 独立核归档与 401 文件集合：394 原字节保留、2 修改和 5 个 v078 helper 原字节一致，schema0；401 文件前后 SHA 一致，137 个隔离 require.cache 条目匹配候选。owned MariaDB port61571/serverId20261111 核身份后 SHUTDOWN，identityBeforeShutdown/serverStopped/portReleased=true，exit0，没有失败续验。正式 v087 索引记录签收，完整候选 manifest 原字节未改。

本轮只更新签收索引和开发交接，不改业务代码、不重跑已通过验证。现役 loaded/main、translation 归档 ACL、实际双 gate 和旧入口禁止再起、生产配置与切换、境内真实回归和境外定时恢复仍未完成；生产继续 HOLD，由经理安排下一项。
