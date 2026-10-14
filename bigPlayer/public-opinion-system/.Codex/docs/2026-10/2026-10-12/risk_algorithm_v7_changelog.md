# 三档风险算法与提示词更新

Status: verified
Date: 2026-10-12

## 变化

以Laura联盟boss集结崩溃帖子为基准，按“关注候选→实际问题/强度超过50%→有证据的严重影响”区分attention、negative、urgent；存储及统计最高等级互斥。具体判定见 docs/design/feature-risk-severity.md。

新增gameRiskEvidence.js识别本条实际崩溃反馈、验证持续阻断/大范围中断/重大资产损失/账号安全的严重影响原句；拒绝假设、否定、已解决、外部/父帖或捏造证据。游戏故障以问句结尾不按咨询处理，模型漏标投诉不覆盖明确故障，模型标urgent但无严重证据时降档。

更新riskSeverityNormalizer.js、aiAnalyzer.js的算法、轻量/深度提示词及缓存版本；同步Git中本次所需的Worker、q1分析Runner、数据库审计落库/缓存和告警入口接线。仅按路径提取相关代码，其他共享工作区改动保留。031/032为现役已使用的risk_context及四档severity基础迁移，本次纳入源码，不在正式库重新执行。

## 验证

node --test server/test/riskSeverityNormalizer.test.js server/test/aiAnalyzer.test.js .tests/2026-10/2026-10-12/risk_algorithm_v7.test.js：49通过、0失败。另从HEAD提取必要源码、覆盖暂存内容后独立验证，同样49通过、0失败，复用本机依赖，不加载生产环境。

PO_RISK_V7_BROWSER_TEST=1 对新增场景运行有界面Edge，验证普通咨询attention、基准崩溃negative、全服中断urgent、正面修复分享normal同表呈现、全选仅选择三档风险及批量弹窗条数。AI适配器实际调用隔离本地HTTP分析服务，模型响应为可控测试fixture，不调用付费AI，不写业务数据。

正式有界面Edge复测：基准帖在负面区、不在关注区，点击详情读取原文和摘要；进入内容列表风险为负面待处理、处理状态待处理且可选。正式GET列表negative包含、attention排除、详情severity=negative，页面错误0。三个现役运行包分别验证四档标准场景输出attention/negative/urgent/normal。

## 现役与打包

最终API=release-20261012-game-risk-v7-r3，采集Worker=worker-release-20261012-game-risk-v7-r3，分析Worker=analysis-release-20261012-game-risk-v7-r3；基于各自最新现役包复制，仅替换规则函数/提示词/新增证据模块，切换前完整XML核对并发变更。正式库无迁移、全库回填或新告警通知。

原运行包附带的历史migrations目录触发运行包白名单校验；已把候选包中该目录归档至仓库根.temp/risk-v7-package-references，原现役包及工作区SQL未改动。最终官方验证：API398文件、采集Worker409文件、分析Worker409文件全部通过，manifest哈希一致。

## 边界

未重算其他历史分析。无法验证严重影响时保守保留较低等级；中文/英文之外的严重影响表达尚无本次确定性识别用例，仍需补充对应原文场景验证。规则影响新任务的缓存命中，新提示词按既有额度进行AI分析，不触发主动全库重分析。
