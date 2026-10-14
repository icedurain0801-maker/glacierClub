# v155 BigPlayer 社区能力门禁真实环境失败验收

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 结论：**FAIL / BLOCKED**
- 验收方式：真实外网 3000 免登录实例的只读验收；未使用 Mock，未连接 4320，未触发“检测能力”，未创建同步任务。

## 验收对象

| 项目 | 实际值 |
| --- | --- |
| 采集源 ID | `8c690d6e-12ea-4ad3-b434-d941276c4906` |
| 采集源 | BigPlayer社区001 |
| 地区 / 社区 | 境外 / X-Clash |
| 平台 | `bigplayer_h5`（BigPlayer社区） |
| 授权 | 已授权；凭据已配置，存在 Token |

## 只读 API 证据

目标源读取结果：

```json
{
  "id": "8c690d6e-12ea-4ad3-b434-d941276c4906",
  "display_name": "BigPlayer社区001",
  "community_name": "X-Clash",
  "region_code": "overseas",
  "platform": "bigplayer_h5",
  "auth_status": "authorized",
  "enabled": true,
  "capabilities": {
    "posts": "configured",
    "comments": "configured"
  }
}
```

普通只读 GET 的 `X-Kong-Upstream-Latency` 为 `348ms`。这不是能力检测耗时，不能替代检测接口的性能结论。

## 页面验收结果

新建真实页面标签并进入目标 Scope：

`https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?sourceId=8c690d6e-12ea-4ad3-b434-d941276c4906&regionCode=overseas&communityId=8b1f0000000000000000000000100016&platform=bigplayer_h5`

| 检查项 | 实际结果 | 判定 |
| --- | --- | --- |
| 帖子能力 | “已配置，未测试” | 不满足可同步条件 |
| 评论能力 | “已配置，未测试” | 未完成能力闭环 |
| 列表“开始同步” | 禁用，提示“请先检测帖子同步能力” | 严格门禁正确生效 |
| 抽屉“开始同步（增量）” | 禁用，提示“请先检测帖子同步能力” | 严格门禁正确生效 |
| 采集频率 | 默认“6 小时”，候选值为“1 小时 / 6 小时 / 1 天” | 页面符合当前字段展示要求 |
| Console `error` / `warn` | 空数组 | 未发现前端控制台错误或告警 |

开发交付方提供的实时检测证据显示：`POST /check-capabilities` 返回 HTTP 200，`X-Kong-Upstream-Latency: 5037ms`，但检测后 `posts=configured`、`comments=configured`，页面刷新后仍为“已配置，未测试”。该证据与本次只读页面状态一致。

## 判定依据

前端同步门禁只允许帖子能力为 `full`、`authorized_scope` 或 `supported`。当前 `posts=configured` 不在允许集合中，因此同步必须禁止。评论能力未测试本身不应单独阻断帖子同步；本次阻断的直接原因是帖子能力本身仍为 `configured`。

因此，“真实能力检测闭环成功并可创建同步任务”的验收目标未达成；但“不放宽门禁、不允许未验证帖子同步”的保护行为符合预期。

## 缺陷退回

请开发负责人定位能力检测接口成功但未将 `posts` 持久化为允许状态的原因，并提供可复验的真实源闭环证据：检测响应、持久化后的来源读取结果、刷新后页面状态，以及成功创建的同步任务记录。修复前不得放宽 `configured` 状态的同步门禁。
