# Discord 恢复后近 7 天帖子可见性验收

- 日期：2026-09-14
- 关联 source：`b696e67c-cd20-47bf-97f4-50300feda885`
- 关联 run：`a116e1bb-68b5-4c74-8cf5-a808c6491be7`（partial）
- 页面：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=discord&publishedFrom=2026-09-08&publishedTo=2026-09-14&contentType=post&contentMode=post`
- 范围：仅浏览器查询；不触发同步、回溯、Worker 或写入；本轮只验收帖子

## 结果：PASS（帖子）

筛选“境外 / Last Light / Discord / 近 7 天（2026-09-08 至 2026-09-14）”后，页面显示帖子 `121`、评论 `0`、负面待处理 `16`、关注级 `18`。帖子列表真实非空，顶部显示根帖 `1548846804294963201`（`Hi`，2026-09-14 08:04:14）、`1548818984055480353` 等，来源为“Discord001”，地区/社区为“境外 / Last Light”。

评论为 `0` 与已登记的 `comments page 1 failed` 后续缺陷一致；该问题不在本轮帖子恢复验收阻断范围内。

浏览器截图已在测试会话输出并回传项目经理。
