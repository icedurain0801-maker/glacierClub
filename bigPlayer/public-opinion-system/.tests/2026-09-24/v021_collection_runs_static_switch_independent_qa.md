# v021 collection-runs 静态资源切换独立 QA

- 日期：2026-09-24
- 实例：`http://127.0.0.1:3000`；全程只读。
- 真实 Run：`f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`。
- 未执行：重跑、数据写入、删除、`BIGPLAYER_API_SYNC_ENABLED` gate 变更。

## 结论

`PASS_REAL_RUN_READ_ONLY_ACCEPTANCE`

## 浏览器证据

1. 新开含 `runId` 的 collection-runs 深链；初始化后 URL 保留 `runId`，并重新排列为最后一个查询参数。
2. 运行列表结束加载，目标 Run 自动展开；状态“授权范围完成”。
3. 详情显示窗口 `2026-09-23 00:00:00 至 2026-09-24 08:56:54`、帖子 209、真实评论正文 337、已加载 50 条。
4. 切换“评论正文”后，列表行类型为“评论”，并显示实际正文，例如“不错”“感谢分享”。

## API 基线

- Run API 的 `window_start/window_end` 与 `windowStart/windowEnd` 均存在。
- posts/comments contents 行均存在 `feed_key/page_kind`。
- 真实 Run 基线保持 posts=209、comments=337。

## 门禁说明

本报告仅确认真实 Run 的只读 UI/API 验收通过；未执行或解除 `BIGPLAYER_API_SYNC_ENABLED` gate。
