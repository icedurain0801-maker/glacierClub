# 第一源历史身份只读核查

Status: HISTORY_EVIDENCE_GAP / production-NO_GO

2026-10-09本轮只读SELECT，source `081a16d2-5545-4afd-9c65-e04777e4540b`。

| 内容raw证据 | 数量 |
|---|---:|
| 全部内容 | 4384 |
| _overseasScope | 0 |
| _lastNightScope.boardId | 0 |
| _overseasScope.siteUrl / siteId | 0 / 0 |
| 顶层boardId / board_id | 17 / 0 |
| 顶层siteId / siteUrl | 0 / 0 |

run关联按sync_scope、site分组COUNT DISTINCT content_id（组间会重叠，不能相加当总内容数）：

| scope | site | 关联内容数 |
|---|---|---:|
| posts | NULL | 1823 |
| posts | legacy-8483a64ab230417e63c5e30d77b0a6f0 | 101 |
| posts | site-3bb48be7f9a82185d6a045e9a5cbd3d7 | 102 |
| posts | site-f069f4495d534693dd87b2485053e7cd | 103 |
| comments | NULL | 2278 |
| comments | legacy-8483a64ab230417e63c5e30d77b0a6f0 | 171 |
| comments | site-3bb48be7f9a82185d6a045e9a5cbd3d7 | 169 |
| comments | site-f069f4495d534693dd87b2485053e7cd | 172 |

实际run表没有board/siteURL快照字段。部分site关联只证明历史run关联，不自动证明board及历史不可变URL。第一源“配置完整”不等于既有历史身份已足够；新PageStore默认会拒绝无法证明的历史行，不能回填当前config充当历史证据。

后续须只读核验既有外部历史采集证据/合同及关联，形成精确证明方案交经理/QA；如确实无证，另行处理覆盖策略，不篡改历史、不删数据、不默认放行。新前向合同和隔离端到端继续，不因缺口缩减最终海外范围。

本轮仅输出聚合数，不打印凭据/原始正文；未HTTP采集、登录刷新、写库或DDL。
