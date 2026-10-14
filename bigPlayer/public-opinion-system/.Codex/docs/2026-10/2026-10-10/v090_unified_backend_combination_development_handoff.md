---
last_updated: 2026-10-10
status: frozen-composed-candidate-development-and-independent-partial-pass
owner: 开发负责人
production: HOLD
---

# 统一后端候选组合交接

按经理本轮最小派单，统一候选 v089 使用 v087 的当前登录修复 API，复用 v078 的 collection、analysis、overseas、translation 四树。5 树均逐字节复制，未改业务源码；开发与独立组合 QA 的两个新增衔接均一次通过。签收仅覆盖隔离组合范围，未生产切换。

## 冻结身份和全量清单

完整候选 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-unified-backend-v089/manifest.json`，SHA `99ace6cc9c3c040aa8eab3d548e002a7fc9a74503a19aed910feb5ca2fc35cc2`。正式签收索引为同目录 `v089_unified_backend_candidate_manifest.json`；完整 manifest 继续冻结，不靠改它更新签收状态。

| 运行树 | 来源完整 manifest | 文件数 | 本轮源码变化 |
|---|---|---:|---|
| api | v087 `77e485dc719bf758c599acc1fb5f9e7ede2f2bc5964fdc1e879a239cbb89c230` | 401 | 无，原字节 |
| collection | v078 `64c030e83c911f6af46fb33baf662825de0ab169c2cc4a077afac0c804051f6e` | 413 | 无，原字节 |
| analysis | 同 v078 | 413 | 无，原字节 |
| overseas | 同 v078 | 412 | 无，原字节 |
| translation | 同 v078 | 413 | 无，原字节 |

共 2052 运行文件，manifest 按树列全量路径、大小、SHA 和来源。另逐字节复制 v078 的 1 个 standalone script overlay 和 3 份 isolated schema 工件，不计入 2052。API 保 v087 登录基底、来源保护；不能混入旧 v078 API。schema 是既有隔离工件，无新增 DDL，也未执行生产 schema。

独立依赖清单位于 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-unified-backend-v089/dependency-inventory.json`，SHA `c0e5c32a020ee56f832d1ec189df55cd9781dc509d04facaa708ffa4596010e6`。五树所有非 node_modules JS 的 literal require 逐项列出：440 个相对引用均解析到包内文件，外部 literal 引用也逐项列出；完整 node_modules 文件包含在全量 SHA 内。入口、Repository 与既有相关变更文件 31JS 加 standalone 1JS，共32语法通过。

standalone script 保持 v078 不完整 overlay 边界；它的外部项目引用另外列出，不能当成安装 CLI 或可执行完整包。没有复制生产环境、凭据、XML、控制器实际 adapter 或 ACL。

构建原件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/unified-backend-v089-build-result.json`，SHA `91e7332a245e96f2e08b50b87b5e40242c4a1339ee780a78d9b8c6457b1ef348`。构建后核全部五树文件集合、原件 SHA、script/schema/artifact 和来源 manifest SHA；源 v087/v078 原字节保持。

## 最小组合直接验证

没有重跑 v064 API-only、v063 writer、v069/v072/v075 等旧矩阵或三站。仅新增本次换 API 后实际 producer-consumer 衔接验证，使用导出内存 handler、自有真实 SQL 与 fake AI。

| 组 | 执行 | 结果 |
|---|---|---|
| 1 新 API → 原 analysis Worker | v087 actual handler reanalyze 返回202并真实入队；v078 actual worker processPersistentAnalysisJobs 领取、冻结和提交；fake analysis 一次，job/result/cache完成，通知0；connector与app登录client为同一对象 | PASS |
| 2 新 API → 原 translation Worker | v087实际Repository安全入队，v078实际translationWorker.runControlled按唯一job完成；fake translation一次，job/result完成且指纹一致 | PASS |

组1 getContentTree 使用真实隔离当前节点查询 adapter，调用一次，不签整树扩展；没有 HTTP listener、真实认证或采集。组2为Repository producer入口，未宣称存在新的翻译 HTTP 接口。collection/overseas 在本轮仅通过字节来源和依赖清单核验，原已验范围沿用各自历史报告，不把本轮两组称全系统验收。

原件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/unified-backend-v089-verification/run-lkMyYR/result.json`，SHA `968bc507460ef92a6c64ced395a075e5394eba9179f7640beb3de83357d88942`。2/2一次通过，无失败续验。自有 MariaDB10.4.14、loopback port63603、serverId20261089、独立datadir/no-defaults/event scheduler OFF；使用原通用隔离schema、三既有候选schema及最小隔离辅助表，未碰生产。所有入口在隔离环境加载，fetch禁止、fake provider；402条实际require.cache路径/SHA匹配组合manifest，不能代替现役loaded。

2052 文件、script/schema/artifact 和来源 manifest 前后哈希一致。核 port/serverId/datadir/pid_file/PID/runner 身份后 SQL SHUTDOWN，identityBeforeShutdown/serverStopped/portReleased=true、exit0。脚本 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/unified-backend-v089-verification/combination.cjs` 与 `lifecycle.cjs` 保留。

复现命令（仓库根）：

```powershell
node '.temp/risk-normalization-20261010/unified-backend-v089-verification/combination.cjs' --isolated --candidate '.temp/risk-normalization-20261010/candidate-unified-backend-v089/manifest.json' 99ace6cc9c3c040aa8eab3d548e002a7fc9a74503a19aed910feb5ca2fc35cc2
```

## 独立组合 QA 与尚未完成的对象

请独立核五树完整组合与原件SHA、API必须来自v087且登录基底/来源保护不回退、四树/script/schema必须保持v078原字节；独立断言仅上述两个组合衔接。开发与历史分项PASS不代签组合。可参考生命周期，替身范围明确；新FAIL保留，仅续未过组。不要重旧矩阵、其他树或三站。

明确不包含 translation 现役归档 ACL/读取修复、现役 loaded/resident main 证明、控制器实际 live adapter、旧Q1/manual/script真实禁止再起、生产schema/配置/精确名单/切换、通知抑制和境内真实回归/境外真实定时恢复。v081/v086仍是后续执行前工件，不因组合包生成而具备真实执行能力。

生产继续 HOLD，无服务/任务/ACL/生产DDL或数据操作、真实采集/AI/通知、push/merge/tag。本候选是统一源码运行包工件，不是可直接获准生产切换的执行器。独立组合通过后交经理安排下一精确缺口。

## 独立组合 QA 签收

独立报告为项目 `.tests/2026-10/2026-10-10/v065_unified_combination_independent_qa.md`。原件位于仓库根 `.temp/qa-v065-combination-IGZa1o/result.json`，SHA `0b0126470e12755ed264586403163190cb28c25bf222b8d1aa395d2d03cf9e7f`。开发已读取正式报告、核对原件 SHA、冻结候选身份和两个 PASS 记录；正式 v089 索引记录签收，完整候选 manifest 原字节不改。

独立 2/2 一次通过。实际内存 API handler 返回202并创建 pending job，原 analysis Worker fake分析一次完成 job/result/cache/成功audit，通知0；登录 client 同一对象，两个未改 guard 代表性拒绝且 query/pool 属性访问0。实际 API Repository 翻译入队后，原 translation Worker 按唯一 job fake翻译一次完成唯一任务和译文，版本/正文/指纹一致。currentNode adapter 调用一次，不签树扩展；没有新增翻译 HTTP 接口、没有常驻 main 执行。

2052 文件实际集合、来源实际字节和前后 SHA 独立核验；API 全树来自 v087，四树、script1、schema3 全部来自 v078，API 登录和来源代码未回退。402 条隔离 require.cache 匹配本候选，只证明该次 QA 进程；collection/overseas 仅签组合字节身份。开发记录的440依赖解析/32JS语法没有冒称 QA 重新执行。

owned MariaDB port64785/serverId20261121 核身份后 SHUTDOWN，identityBeforeShutdown/serverStopped/portReleased=true、exit0，无失败续验。没有改业务代码或生产状态。现役 loaded/main、translation ACL、实际控制器 adapter、旧入口真实禁止再起、双 gate 准入、生产配置/schema/名单/切换、通知及真实定时恢复仍未完成。生产继续 HOLD，交经理安排下一精确缺口，不再重跑本轮已过组合。
