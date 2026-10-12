---
status: FAIL_OBSERVABILITY_PARITY
scope: BigPlayer 单次受控真实 Run 独立浏览器/API/数据复测
date: 2026-09-24
run_id: f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9
---

# 独立复测结果

## 运行态与隔离

- 3000 `GET /health`：HTTP 200，数据库 `ok`，BigPlayer connector configured。
- 详情页：`/admin/PublicOpinion/collection-runs.html?runId=f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9` 正常加载。
- Run API：HTTP 200，`status=completed_authorized_scope`、`source_id=5c21f78d-5f67-4467-963d-dcdeb5e26cab`、`account_id=70c393cf-9600-11f1-b3d2-d85ed3ae61b0`、`community_id=00000000-0000-0000-0000-000000000101`、`platform=bigplayer_h5`、`region_code=domestic`。
- 错误字段为空：`error_code=null`、`error_message=null`。
- 内容 API 使用错误 `communityId/sourceId` 返回 404，正确 community/source 才返回数据，隔离通过。

## 内容与幂等

- `scope=posts` 分页拉全：`209` 条，全部 `content_type=post`、`sync_scope=posts`，community 全部为目标社区，重复内容 ID `0`。
- `scope=comments` 分页拉全：`337` 条，全部 `content_type=comment`、`sync_scope=comments`，community 全部为目标社区，重复内容 ID `0`。
- Run 汇总与 API 数据一致：`fetched=209`、`comment_count=337`；Run 页面显示抓取 `209`、新增 `58`、变更 `151`、未变化 `0`、评论 `337`。
- checkpoint 的 posts/comments 以同一窗口筛选合计 `236` 条：`completed=233`、`running=3`，`items_fetched=905`，与开发侧记录一致；3 个 running checkpoint 未被重试或改写。
- checkpoint task key 中实际存在 `home:merged`、`info` 和 `circle:activity`，但本次内容 API 暴露的 `content_type` 全为 `post`，未能从展示/API字段独立区分动态条目。

## AI 队列

- 精确 source/community 与北京时间窗口查询：`total=686`、`pending=686`、`running=0`、`completed=0`、`failed=0`，`terminal=false`，与“只入队未消费”一致。

## 发现的问题

1. **窗口可观测性失败**：Run API 返回字段集合没有 `window_start/window_end`，浏览器详情也不展示窗口；只能依赖开发侧文档和 checkpoint 反推，无法通过 Run 主记录独立确认“北京时间 2026-09-23 00:00:00 → 2026-09-24 08:56:54”。
2. **评论 UI/API 口径不一致**：浏览器详情明确显示“该站点当前仅提供评论数量，评论内容接口暂不支持”，但 `GET /api/public-opinion/sync-runs/<runId>/contents?scope=comments` 实际返回 `337` 条评论内容。页面未展示这些评论内容。
3. **动态类型可观测性不足**：checkpoint 证明 activity feed 有抓取量，但 Run contents API 的 209 条全部标记为 `content_type=post`，无法独立确认动态与帖子在持久化/展示层是否保持类型隔离。

## 结论

采集、来源/社区隔离、评论 API 数据、checkpoint 数量和 AI pending 状态独立通过；但窗口字段缺失、评论 UI/API 矛盾、动态类型不可观测，导致本轮不能判完整 PASS，结论为 `FAIL_OBSERVABILITY_PARITY`。不启动第二次真实 Run，不修改数据，不解除 gate；缺陷退回开发负责人。
