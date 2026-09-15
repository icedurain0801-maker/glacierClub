# Last Light BigPlayer 8/9 日数据为零只读诊断报告

- 日期：2026-09-10
- 角色：测试负责人
- 范围：境外 `Last Light` / BigPlayer 社区 / 2026-09-08 至 2026-09-09
- 边界：只读 DB、GET API、截图核验和代码路径审查；未修改来源、账号、凭据、数据或配置，未启动采集或 Worker。

## 结论

**FAIL（采集运行态）。** 页面为零不是筛选 mock 问题，也不是源端“无内容”的结论；8/9 日的采集 run 均在读取凭据阶段失败，未发生有效抓取或入库。

## 证据

| 项目 | 结果 |
|---|---|
| 截图筛选 | 境外 Last Light、BigPlayer 社区、2026-09-09；帖子/评论均为 0，列表无匹配内容 |
| 来源/账号状态 | source 与 default account 均 enabled、`authorized`，来源最后成功时间为 `2026-09-07 22:13:53` |
| 2026-09-08 run | `1,578` 次失败，均为 `CREDENTIAL_NOT_FOUND`；fetched/stored/inserted/comments 全为 0 |
| 2026-09-09 run | `1,440` 次失败，均为 `CREDENTIAL_NOT_FOUND`；fetched/stored/inserted/comments 全为 0 |
| 8 日页面范围 | API 仅返回 1 条历史评论，帖子 0；不能视为有效日采集恢复 |
| 9 日页面范围 | API total 0，帖子 0、评论 0；与截图一致 |
| 凭据矛盾 | DB 存在 active `api_token` 的密文记录，但运行时持续报告“account credential is not configured” |

## 根因判断

`auth_status=authorized` 是状态字段，不能证明运行时能通过 `CredentialContext.load(..., 'api_token')` 读取到同一账号的有效凭据。BigPlayer Worker 在实际运行中得到 `CREDENTIAL_NOT_FOUND`，而数据库凭据摘要显示存在 active `api_token`。这是**凭据记录与运行时解析/运行实例配置不一致**，待开发负责人定位；在该矛盾解除并出现成功 run 前，不能将授权状态作为采集可用证据。

## 退回条件

开发负责人需提供脱敏证据证明：目标账号运行时凭据可读取、单次采集 run 成功且 fetched/stored/inserted 非零。之后测试负责人再验收精确 DB、API 与页面数据。
