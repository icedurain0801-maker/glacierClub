---
last_updated: 2026-10-10
status: current-api-frontend-readonly-archives-verified-reintegration-scope-only
owner: 开发负责人
production: HOLD
---

# 新授权持久化 API 与 v214 前端归档及重新集成范围

本轮完整只读归档当前 `sync-auth-persistence-fix` API 和前端v214，核源/ZIP读回/后采样身份及字节一致。对v089只定位最小差异与未来重新集成范围，没有生成新API候选、没有改v089或部署。当前双任务仍Ready/Enabled，旧入口尚未技术封禁，境外定时恢复未验收，生产继续HOLD。

## 完整归档与身份

归档前北京时间18:13:26、后18:13:30；6服务唯一直属Node和3任务关键配置稳定。source文件复制前后、ZIP每项读回和后采样后源SHA复核一致。敏感配置/XML原字节仅保仓库根忽略目录，不回显、不提交。

| 对象 | 当前Node/wrapper及UTC创建时间 | 完整运行包 | ZIP SHA |
|---|---|---|---|
| API | 22680/16720；2026-10-10T10:06:23.0642690Z | 396文件；`C:\ProgramData\PublicOpinion\releases\release-20261010-sync-auth-persistence-fix` | `faa76c0a7feb749d12188380b1e0b2b16b566733206475fe5129e700da71ec6b` |
| 前端 | 18460/19104；2026-10-10T10:06:24.7724890Z | 34文件；`C:\ProgramData\PublicOpinion\frontend3001\releases\release-20261010-sync-auth-v214` | `ef17d2aa564f75d9829a7be54ca4b0399ec2c8a3b871b2964109493fc89caa21` |

完整manifest `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/control-refresh-v091/archive-current-v093/archive-manifest.json` SHA `805f0d33a886c890fc54392b4052da2d5cfc0cd95c82e79af59d1e019afb6977`；原manifest保pending字样原字节，后采样签收另写 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/control-refresh-v091/archive-current-v093/post-identity-verification.json` SHA `c73825fe8edc6c64794c8cc7fa916fae157b387bc6a4ae162c5c409e6f403856`。文件路径/大小/SHA、API/前端两份XML原字节与其SHA均在manifest列全量。ZIP保内容与路径，不保Windows ACL/服务注册或恢复设置、不包含外部环境引用/其他任务定义，不能当自动回退执行器。

shared与analysis磁盘408文件各仍匹配v083原归档；translation仍406枚举/0文件可读，拒读不变，不改ACL。本轮不重新归档这三树。两任务Action/Enabled仍原状，未实际暂停或排空，服务仍Running/Auto。

## 当前 API 与 v089 的最小差异

当前396、v089 API401；391同字节、5现有路径不同、当前独有0、候选独有5helper。差异工件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/control-refresh-v091/archive-current-v093/api-v089-diff.json` SHA `0e9cabd69c423e101426dca791d4cbd3ca2d8467a0a57fa4a8d217fdfee408a2`；非敏感业务源码diff `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/control-refresh-v091/archive-current-v093/current-api-vs-v089.diff` SHA `033bf0b76856c05f243cd4858f4ef984d86ad2ab4c0277e5a77943357e7c058d`。diff方向 current→v089，减少项代表新现役修复在旧候选中不存在，不能照diff回退。

| 不同路径 | 当前已存在而必须保留的内容 | 后续最小处理 |
|---|---|---|
| `server/src/app.js` | BigPlayer能力health根据实际detect结果推导；凭据缺失/停用/过期/解密失败等publicMessages；原登录注入与来源保护 | 基当前源码只补safe enqueue冲突409和必要错误映射，保其他分支 |
| `server/src/connectors/bigPlayerH5Connector.js` | 领取登录auth result后调用saveApiAuthorization；按source/account和connector绑定的WeakMap能力探测token promise复用，刷新时清promise；能力错误码、父帖复用与finally清理 | 保当前文件原字节，不换成v089 connector |
| `server/src/services/credentialContext.js` | saveApiAuthorization校验账号归属和token/expiry，加密写凭据，并传replaceExpireAt=true | 保当前文件原字节，不删除此持久化能力 |
| `server/src/db/repository.js` | upsertAccountCredential带replaceExpireAt，SQL允许用新expiry替换旧值，包括清除旧过期时间 | 保授权方法和SQL，只补v089的safe producer/旧writer拒绝 |
| `package-release-manifest.json` | 当前包的发布元数据与旧包不同 | 当前原件保留，不能拿它旧声明替代新候选实际全量SHA；新revision另完整manifest |

5候选独有helper：`server/src/services/currentTranslationConsumer.js`, `server/src/services/historicalAnalysisAdmission.js`, `server/src/services/safeAnalysisEnqueue.js`, `server/src/services/translationIntentProtocol.js`, `shared/riskPolicyHistory.js`。后续从已验v089/v087原件逐字节复用，只接安全入队/必要依赖，不新增current-body capture/replay/repair API、风险规则或通知。

未来最小实现预期仍是当前396基底只改app/repository两原文件、加5helper，其余394当前原字节保留。必须生成新API完整revision、再生成替换API的统一revision，旧v089保持冻结，不伪改原SHA。当前connector/credentialContext以及Repository授权SQL不应被writer集成覆盖。

这份范围是代码静态结论，不签新授权业务已真实修复：没有认证/外网采集/DB观察。shared/analysis等旧树是否与新持久化凭据完全兼容本轮待确认，不自动扩项合并。

## 后续验证范围与当前非执行边界

后续仅最小新增重叠：新授权结果一次持久化及旧expiry替换；source/account绑定probe token复用与刷新；能力health/凭据错误文案保留；新基底safe producer与9旧入口拒绝；新API独立验收后只做必要组合衔接。采用fake login/provider与owned隔离SQL，授权真实采集另界定。开发和旧v064/v065 PASS不能代签新基底，不重旧全矩阵或三站。

v214完整前端保新发布，其sources草稿行为是否仍符合v065保护本轮未测，不把文件差异当退化。LoginSession非操作对象。最新控制清单v091/v092继续有效的非API部分，包括双任务/旧manual禁止再起、API/shared准入、双gate排空、translation stop-only回退、loaded/main和未来窗口验收；所有控制均未生效。

归档完成更新了清单中“当前API/前端完整文件归档”缺口，不能解除API新基底再集成、实际adapter、loaded/pause、translation完整回退或stop-only核收、当前任务原XML/海外完整归档、生产schema/config精确名单/通知和真实定时恢复缺口。保HOLD，不服务任务ACL/DDL/生产数据、真实HTTP/认证/采集/AI/通知、push/merge/tag。
