---
status: PASS_OFFLINE_ONLY
role: 测试负责人
scope: v356 阶段 2 migration 029 / site identity 离线候选
date: 2026-09-22
---

# v357 BigPlayer 029 / site identity 离线候选独立 QA

## 结论

**PASS_OFFLINE_ONLY**。

候选仅通过离线模拟闭包，不代表生产 migration、配置对齐或真实采集已通过。

## 核验结果

| 检查 | 结果 |
|---|---|
| `offline-candidate.test.js` | 5/5 PASS |
| 95 条冻结 baseline | `rowCount=95`、`distinctCpIdCount=95`；候选冻结副本与阶段 1 原文一致 |
| site identity 保留 | 17 条 `legacy-*` 保留；78 条历史 `NULL` 未批量补成 `site-*` |
| migration 029 | 仅包含 `site_url_snapshot`、`last_request_at` 和索引的离线审阅 DDL；未执行 |
| 同 URL repair | 仅按 source+URL 识别，保留 legacy ID，不重写历史 NULL |
| 最近 7 天边界 | `[start,end)`；上界内容排除，窗口外内容不纳入 |
| 离线 apply 幂等 | 重复 apply 状态不变 |
| rollback | 内存模拟恢复原 schema 状态通过 |
| candidate checksums | 全量校验，0 missing/hash failure |
| manifest/provenance | candidateId 一致；payload 包含 migration、identity plan、offline test；`offlineOnly=true`、`productionApply=not executed` |

## 强制边界

- 未连接生产 DB、未执行 DDL、未修改正式 config/run/checkpoint、未切 Worker、未重启、未执行真实 Run、未发布、未 push、未访问 3001。
- 该 PASS 只允许进入后续正式迁移审批；正式执行前仍需获批窗口、schema ledger/字段只读复核、site identity 变更审计和回滚责任确认。
