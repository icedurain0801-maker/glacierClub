# P0 用户页真实内容四层验收报告

- 日期：2026-09-10
- 角色：测试负责人
- 验收范围：`domestic / 超能世界国服版 / bigplayer_h5 / 2026-09-09`
- 页面：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&publishedFrom=2026-09-09&publishedTo=2026-09-09`
- 边界：只读 DB、GET API 与页面验收；未修改业务代码、数据或配置，未启动 Worker、采集或任务，未提交、push 或发版。

## 结论

**PASS。** 指定用户页可见真实帖子与评论，DB、API 与页面统计一致；本验收不以此前 aborted run 作为页面可见性阻塞条件。

| 验收层 | 帖子 | 评论 | 合计 | 结果 |
|---|---:|---:|---:|---|
| 精确 DB | 179 | 303 | 482 | 通过 |
| GET `/api/public-opinion/contents` | 列表可返回 | 精确总数包含 | 482 | 通过 |
| GET `/api/public-opinion/contents/stats` | 179 | 303 | 482 | 通过 |
| 指定用户页 | 179，实际帖子列表可见 | 303，实际评论列表可见 | 页面分别显示 `共 179 条`、`共 303 条` | 通过 |

API 与数据库使用页面对应的北京时间 `2026-09-09` 窗口，即 UTC `2026-09-08T16:00:00.000Z` 至 `2026-09-09T16:00:00.000Z`。页面同时显示该社区、BigPlayer 平台和两个日期筛选值；帖子、评论、负面待处理 `63`、关注级 `68` 的统计均已加载。

## 残余风险

此前采集 run aborted 与 Worker 重载问题属于后台运行态残余风险，不影响本次真实数据的用户页可见性结论；后续受控采集仍应继续遵守无竞争门禁。
