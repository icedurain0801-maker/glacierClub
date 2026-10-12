# 海外候选2隔离交接

Status: PARTIAL_OFFLINE_CANDIDATE / PRODUCTION_NO_GO / independent-QA-pending

## 本轮范围

新PageStore/PageJobs/RunContractJournal/SourceRouter/DrainController及可选主链入口。复用实际Repository内容事务，非目标原依赖不变；当前buildDeps没有启用新路由，无新进程/真实采集/DB写入/DDL/删除/切换。
旧方案全部保留，本轮实际删除清单为空；六社区UI独立QA PASS另案，不替代海外验收。

## 验证

新模块联合32/32开发自测通过，原始 `.tests/2026-10/2026-10-09/overseas-candidate2-new-modules-raw.txt`。完整候选联合原始结果以 `overseas-candidate2-developer-raw.txt` 最终结尾为准，不以中间输出宣称通过。
PageStore直接调用实际Repository._upsertContentPageAttempt，但fake连接仍不是真实DB；PageJobs策略/入队单测目前stub，实际Repository队列与页事务集成尚未完成。

## 必须继续，不能报全链完成

| 未完成 | 边界 |
|---|---|
| 可信JOIN loader、旧schema run创建/调度/恢复与合同生命周期接线 | 新journal已实现create/read/verify，但主链仍需绑定可信expected与首次run/恢复区别，不能空回调放行 |
| first-source历史scope证明 | 缺siteURL/board证据失败关闭，不拿当前config补历史；跨站同内容须真实历史合同证明 |
| session→主链→存储→AI/翻译完整离线E2E | 原策略不能重复入队、不能修改异fingerprint正在运行任务 |
| drain全部入口与负载 | 当前仅admission原语和runSource票据，不宣称scan/scheduler/poll/main已安全收口 |
| 第二源board/registry/401 | 不刷新、不借第一源board、不改历史配置，最终范围不缩减 |
| 真实共享接管/下一定时槽位 | 待具体影响确认，不改PID19584/现役release/XML/env |

请QA锁完整超集manifest前后字节、独立复跑新旧联合、审查scope/lease/CAS/commit未知/历史证明/队列保护与候选未完成边界。任何部分PASS不得等同生产GO。
