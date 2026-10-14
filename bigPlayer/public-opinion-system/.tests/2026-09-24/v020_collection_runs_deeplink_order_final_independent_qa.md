# v020 collection-runs 深链顺序最终独立 QA

- 日期：2026-09-24
- 实例：`http://127.0.0.1:3000`；仅只读。
- 真实 Run：`f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`。
- 未执行：重跑、数据写入、gate 变更、schema/迁移或跨平台修改。

## 最终结论

`FAIL_DEEPLINK_UI_RUNTIME`

## 浏览器实测

新开页面时请求 URL 含 `runId=f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`。初始化完成后：

1. 地址栏仅剩 `regionCode/communityId/platform`，`runId` 被移除；
2. 列表持续显示“加载中…”和“正在加载抓取记录…”；
3. 没有目标 Run 的详情区域、窗口、帖子或评论内容。

因此深链参数保持和详情展开两项均不通过。

## API 回归

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Run 窗口 | PASS | snake_case 与 camelCase 的 `windowStart/windowEnd` 均存在。 |
| 内容分类 | PASS | posts/comments 行均有 `feed_key/page_kind`。 |
| 真实基线 | PASS | `fetched_count=209`、`comment_count=337`；评论正文示例“不错”。 |

## 门禁结论

真实 Run UI 验收未通过，`BIGPLAYER_API_SYNC_ENABLED` gate 必须继续关闭。
