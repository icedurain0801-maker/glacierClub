---
last_updated: 2026-09-10
status: accepted
scope: last-light-bigplayer-runtime-credential
owner: 项目经理
---

# v065 P0 Last Light BigPlayer 运行时凭据恢复

## 验收目标

恢复境外 Last Light 的 BigPlayer 社区在 2026-09-08 至 2026-09-09 的真实内容采集，并使精确 API 与用户页面显示非零内容。

## 已确认事实

- 来源与默认账号均为 `enabled`、`authorized`。
- 数据库存在 active 的 `api_token` 密文记录。
- 2026-09-08 的 1,578 次 run 与 2026-09-09 的 1,440 次 run 均在运行时以 `CREDENTIAL_NOT_FOUND` 失败，未抓取或入库。
- 当前禁止将 `auth_status` 或数据库密文存在视为运行时凭据可用的替代证据。

## 验收结果

唯一真实 run `76437a7a-8f49-4abf-85e0-88d090e2ea99` 已达到 `completed_authorized_scope`。

| 日期 | 帖子 | 评论 | 合计 |
|---|---:|---:|---:|
| 2026-09-08 | 15 | 16 | 31 |
| 2026-09-09 | 10 | 20 | 30 |
| 合计 | 25 | 36 | 61 |

测试负责人已确认 DB、真实 API 与用户页面四层一致，两个自然日均非零。验收报告：`.tests/2026-09/2026-09-10/v069_p0_last_night_bigplayer_real_collection_acceptance.md`。

## 待办

| 状态 | 事项 | 负责人 |
|---|---|---|
| done | 核对目标账号 `CredentialContext.load(..., 'api_token')` 的运行时解析、运行实例配置与数据库记录归属 | 开发负责人 |
| done | 仅在运行时凭据健康通过后执行一次精确真实采集 | 开发负责人 |
| done | DB、API、页面真实内容验收 | 测试负责人 |
| pending | TLS 校验关闭风险：`NODE_TLS_REJECT_UNAUTHORIZED=0` | 独立 P1 |
| pending | 异步分析导致 attention 实时统计波动的展示口径 | 独立 P1 |

## 边界

- 诊断阶段不改代码、数据、凭据或配置，不启动 Worker/采集。
- 任何需要刷新或写回凭据的动作须以单账号、脱敏、可审计范围执行。
- 未经真实成功 run 与页面验收，不能关闭本 P0。
