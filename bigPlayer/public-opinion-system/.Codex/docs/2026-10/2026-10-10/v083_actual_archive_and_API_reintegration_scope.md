---
last_updated: 2026-10-10
status: readonly-archive-partial-production-HOLD
owner: 开发负责人
production: HOLD
---

# 实际归档、API漂移与重新集成范围

本轮已保存四服务当前XML原字节；当前API、shared和analysis运行包完成逐文件归档与读回校验。TranslationWorker运行包及入口仍拒读，明确不能完整回退。**境外定时同步尚未恢复，未切换生产。**

用户转入经理确认：原v081/v082 API目标作废，当前 `login-auth-fix` release为新基线，不覆盖当前登录修复；来源前端v211不操作。本轮仅只读文件/CIM/任务观察及离线模型，不服务/任务/ACL/DDL/生产数据、HTTP/采集/AI/通知动作。

## 原件与归档

仓库根 `.temp/risk-normalization-20261010/writer-preflight-v083/` 保存归档器、只读采样和原件。归档含配置敏感字节，只存忽略目录，未回显内容、不提交；路径/SHA是核验索引，不将归档内配置写入正式文档。

- 前采样 `runtime-identity.json` SHA `d6a7a3f13c142e816ba6f4b9b93b7dbc1cce48622192784a714892f30a54f82e`，UTC `2026-10-10T09:35:43.4229402Z`（北京时间17:35）。
- 最终归档 `archive-20261010T093639838740Z/archive-manifest.json` SHA `8f023f22a787b7d74c8478bac664f9cd0c4d2c2ced9e4e0371958a06a876390e`。
- 首轮原件 `archive-20261010T093548204878Z/archive-manifest.json` SHA `cfe2e4e8f9ec0a98fec998313a03d395b217594e44a37f421c0f664bee99649e`，先对漂移API停止归档，保留原件。经理确认当前API新基线后，最终轮观察归档当前包；未重新定向切换对象。
- 后采样 `runtime-identity-after.json` 及 `archive-post-identity-verification.json` 保留。归档前后四服务PID/createTime/command/XML均一致。前采样曾在续采样中被替换，随后从归档所存身份字段恢复并精确核回原SHA；中间reconstructed文件保留作诊断，不作为新实时采样。

归档按明确release根目录枚举，不跟随reparse/symlink；每文件源SHA→复制流SHA→zip读回SHA→最终源SHA一致，文件/目录集合前后一致。ZIP保字节和路径，不恢复Windows ACL、外部env引用、服务注册、任务状态或全部运行环境，不能等同可自动发版的回退执行器。

| 对象 | 当前Node/wrapper | XML原字节 | 完整release归档 |
|---|---|---|---|
| PublicOpinionApi | 9328/8432 | 已核SHA原字节 | 396文件，完整；新登录修复基线，旧v082目标失效 |
| PublicOpinionWorker | 38428/16020 | 已核SHA原字节 | 408文件，完整 |
| PublicOpinionAnalysisWorker | 20352/20272 | 已核SHA原字节 | 408文件，完整 |
| PublicOpinionTranslationWorker | 20056/14372 | 已核SHA原字节 | 0文件，406个拒读/失败记录；不完整 |

XML及ZIP精确SHA、源根、entryProbe和全部文件SHA见归档manifest及后续正式核收索引。四现役loaded继续UNKNOWN，未注入探针/inspect内存。归档可读文件不证明当前进程已加载同字节。

TranslationWorker入口 `C:/ProgramData/PublicOpinion/releases/translation-release-p0-20260918144000/worker/src/translationWorker.js`，原Node/createTime/command及XML未漂移。原件保存entry读取异常类型/errno/winerror、每路径读取失败，不输出异常中的内容或凭据。尚不能借此分辨每一项具体权限原因；仅确认本身份读取失败。不改ACL、不换身份、不用其它包当原包；下一步需获准服务身份只读归档，或明确核收旧consumer停止且不自动恢复的回退策略。

## API已变更与候选差异

实际API Node9328/wrapper8432，创建UTC `2026-10-10T09:27:20.5953320Z`（北京时间17:27）；入口 `C:/ProgramData/PublicOpinion/releases/release-20261010-login-auth-fix/server/src/app.js`。原Node5216/wrapper38336及XML/commandSHA已作废。本轮不归因该发布的来源或授权，不覆盖它。

归档与v078 `runtime-api`逐文件路径/SHA比较：实际396、候选401；相同389，差异6，实际独有1，候选独有6。原件在仓库根 `.temp/risk-normalization-20261010/employee-api-diff-v083/diff.json`；非敏感源码diff已按行结束符归一，仅用于阅读，原SHA比较保留原字节。

| 文件 | 现役与v078差异 / 最小处理 |
|---|---|
| `server/src/app.js` | 当前向BigPlayerH5Connector显式传loginSessionClient；GET sources限制路径、详情单源/404及scope匹配检查；v078缺这些而含safe enqueue的409映射。保当前登录/来源分支，仅合入已验writer错误映射与相应接线 |
| `server/src/connectors/bigPlayerH5Connector.js` | 当前保ConnectorError的LOGIN_SESSION_CLIENT_UNAVAILABLE及授权检测cause细化；v078为旧逻辑。沿当前文件保留，不能倒退替换 |
| `server/src/db/repository.js` | v078增加safe analysis/translation enqueue、当前intent、历史保护、旧consumer拒绝；当前未含同套改动。沿当前基底合入已验范围，复核新增helpers和跨实例授权边界，不整文件盲盖 |
| `server/src/integrations/aiAnalyzer.js` | 风险口径/输出归一化与候选差异，属于此前已验基底链，保持必要契约，不扩大新规则 |
| `server/src/pipeline/alertEngine.js` | 候选含风险历史抑制及归一化，当前不同；不是本轮实现通知发送前抑制 |
| `server/src/services/riskSeverityNormalizer.js` | 当前0.6+confidence条件，候选0.5/gameComplaint等已验口径，差异明确，重新集成须按此前已拍板规则保基底契约 |

实际独有 `package-release-manifest.json` 作为归档原件保存，不假借其旧声明代替实际文件集合。候选独有：`currentAnalysisIntent.js`、`currentTranslationConsumer.js`、`historicalAnalysisAdmission.js`、`safeAnalysisEnqueue.js`、`translationIntentProtocol.js`、`shared/riskPolicyHistory.js`。依赖目录其余内容相同，不升级依赖。

**本轮只列重新集成范围，没有改v078、没有产生新的已验API候选。** 最小后续在当前完整API归档基底上形成新revision，保登录client注入/来源详情路由/错误口径，合并已验writer与必要6个helper契约；API须有独立新manifest，再只验新增重叠路径。原v078 API独立PASS不自动覆盖新基底。

建议最小新增验收：合成API handler来源详情/列表/嵌套授权路径不会被列表截获；Connector fake login client注入及失败code；safe重析409保持active不变、shared/helper接线及借事务保护的API受影响路径。已有其他运行树和旧矩阵不复跑。本轮没做这些测试，需后续派单。

## 控制与回退边界

v081/v082保持历史冻结，不能在其原API条目上追随新PID自动执行；新基线要带当前XML、包SHA和最小新API候选重新核收。当前登录修复与v211静态前端保留。

失败回退保原XML与已归档包，但不能自动RestoreAll重起旧split；translation不完整归档继续阻止称全量回退已就绪。intent/audit/repair/已提交结果保留，不DROP、清lease或回滚全库。双gate模型及loaded/main方案在后续文档单列，工件不是批准，生产HOLD。
