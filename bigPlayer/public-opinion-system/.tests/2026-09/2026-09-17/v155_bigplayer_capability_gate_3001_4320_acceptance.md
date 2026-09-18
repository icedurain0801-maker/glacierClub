# v155 BigPlayer 能力检测 P0：3001→4320 真实链路验收

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 结论：**PASS**
- 范围：真实页面 `https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html` 的 3001→4320 链路；未使用 Mock，未连接 3000 旧适配器。

## 验收对象

| 项目 | 值 |
| --- | --- |
| 采集源 ID | `8c690d6e-12ea-4ad3-b434-d941276c4906` |
| 采集源 / Scope | BigPlayer社区001 / 境外 X-Clash |
| 平台 | `bigplayer_h5` |
| 授权 | 已授权，Token 已配置 |

## 完整闭环结果

| 步骤 | 真实环境证据 | 判定 |
| --- | --- | --- |
| 加载新 API | 3001 页面在目标 Scope 正确加载目标源 | 通过 |
| `check-capabilities` | 页面按钮从“检测能力”进入“检测中…”，完成后帖子、评论均显示“授权范围” | 通过 |
| 刷新持久化 | 页面刷新后帖子、评论仍均显示“授权范围”；未回退至“已配置，未测试” | 通过 |
| 持久化读取 | `GET /api/public-opinion/sources/8c690d6e-12ea-4ad3-b434-d941276c4906`：HTTP 200，`posts=authorized_scope`、`comments=authorized_scope`、`auth_status=authorized`、`enabled=1`；`X-Kong-Upstream-Latency=424ms` | 通过 |
| 同步门禁 | 列表“开始同步”与抽屉“开始同步（增量）”均已解锁 | 通过 |
| 创建任务 | 点击“开始同步（增量）”后，页面跳转携带 `syncRunId=fcfa2709-712a-49ee-97d5-bf577aed034c`，显示“同步任务已提交，采集源已启用”；实时进度显示“等待执行” | 通过 |
| 控制台 | 最终 `error` / `warn` 日志为空 | 通过 |

## 关键状态

```json
{
  "sourceId": "8c690d6e-12ea-4ad3-b434-d941276c4906",
  "auth_status": "authorized",
  "posts": "authorized_scope",
  "comments": "authorized_scope",
  "enabled": true,
  "syncRunId": "fcfa2709-712a-49ee-97d5-bf577aed034c",
  "syncState": "等待执行"
}
```

## 备注

旧环境的失败证据保留在 `v155_bigplayer_capability_gate_real_failure_acceptance.md`，不作为本次修复后的结论。本报告是本轮 P0 修复后的唯一验收结论。
