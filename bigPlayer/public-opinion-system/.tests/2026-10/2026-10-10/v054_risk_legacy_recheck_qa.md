# v054 风险候选最小复验 FAIL

日期：2026-10-10。candidate-nc7FdP / v059。整体最终结论：FAIL，仅legacy咨询受影响复验，未重跑SQL/API。

冻结15文件SHA、runtime manifest SHA `f2fc3e646606b0a7e978a94162c2c3b6f37e9574a8579d268fa15e52aefa941f`、三套overlay输出与runtime均匹配。对比v058三runtime清单，仅normalizer变化，其余运行文件SHA相同，因此保留v053独立SQL/API通过证据，不重跑完整实库。

自有必要用例：42PASS/6FAIL，exit1；两个不同反例在api/analysis/collection各失败一次。均使用negative/attention/negativeScore0.1/confidence0、缺gameComplaint的legacy结果，正文分别为：

| 普通咨询正文 | 预期 | 实际 | 原因 |
|---|---|---|---|
| 请问有bug反馈入口吗？ | attention | urgent | 新首条正则把“有bug”当实际发生故障，忽略句中询问入口语义 |
| 请问漏洞反馈入口在哪里？ | attention | urgent | 既有外挂/作弊/漏洞规则后缀可选，裸“漏洞”仍机械触发 |

这是原退回缺语义字段咨询路径的直接同类反例，不扩为无关矩阵。不是生产记录的情感判定。普通咨询不得因关键词升级的定稿仍未完全满足。

已通过：v053原公告反例、中英文bug/crash咨询、裸bug/崩溃词、匹配机制问法；中文“游戏出bug了/一直崩溃”与英文“game keeps crashing”低分明确故障；正文存在时不借topics/reason补故障；显式gc true/false；positive优先normal；50%且confidence0直接urgent。

证据：仓库根 `.temp/qa-v054-risk-recheck-1791614568438.json`；脚本 `v054_risk_legacy_recheck.cjs`。全程进程内pure function、fetch禁用，无数据库启动或外部请求。

生产未实施：未部署、未写生产数据、未重抓或付费AI；真实目标纠偏及存量审计、外部历史通知未执行，不报生产全量修复。已退开发最小补齐同路径语义，待新冻结仅复验受影响场景。
