# v151 境外翻译四类状态真实服务只读验收

- 日期：2026-09-16
- 角色：测试负责人
- 环境：`https://lfy3001.dev.q1op.com`，境外 / Last Light / BigPlayer社区
- 边界：仅使用既有真实记录、只读 API 与真实浏览器详情页；未启动服务、未触发翻译补偿/重试、未写入数据，未使用 3000 Mock 适配器。

## 结论

**PASS：四类所需页面状态均已在后续真实服务取得证据。**

`pending/running/retryable` 是同一“生成中”页面分支：本轮发现并实际验收了 `pending` 与 `retryable`；未发现可供只读复核的 `running` 现存记录，不把它虚构为已单独覆盖。该分支的页面文案和行为已由两种实际状态共同覆盖。

## 真实记录与页面证据

| 状态 | 真实记录 | 页面入口 | 浏览器显示证据 |
| --- | --- | --- | --- |
| `completed` | 内容 `9c8f31c8-bf21-437e-b146-064ac52f2f6a`，外部 ID `1479316`；既有 job `cc8ca4f6-a220-4b4a-a6e3-7646c0e50edc` | `content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5&postId=1479316&contentId=9c8f31c8-bf21-437e-b146-064ac52f2f6a` | “中文翻译”显示“有人能告诉我为什么我无法在游戏中发送消息或回复吗？感觉有点孤单”，未显示“生成中”。 |
| `not_requested` | 内容 `1849b584-fe17-4eb0-8f68-a47f383e6513`，外部 ID `1460017` | `content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5&postId=1460017&contentId=1849b584-fe17-4eb0-8f68-a47f383e6513` | “中文翻译”显示“暂无中文翻译”。 |
| `pending` | 评论 `4b475476-76bf-4662-94d9-42c4505db5c9`，外部 ID `3392071`，归属帖子 `1479316` | 上述 `1479316` 详情入口 | 评论项显示“中文翻译生成中”。只读详情 API 同时返回 `translation.status=pending`。 |
| `retryable` | 内容 `aa248551-9d1e-4071-9895-421eae3c8f85`，外部 ID `1437215`，只读 API 错误码 `AI_TRANSLATION_DAILY_LIMIT_REACHED` | `content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5&postId=1437215&contentId=aa248551-9d1e-4071-9895-421eae3c8f85` | “中文翻译”显示“中文翻译生成中”，未暴露内部错误码。 |
| `failed` | 内容 `ad8bad29-406f-4a9c-abd0-c7c3bf7a39f8`，外部 ID `1451866`，只读 API 错误码 `AI_TRANSLATION_INCOMPLETE_RESPONSE` | `content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5&postId=1451866&contentId=ad8bad29-406f-4a9c-abd0-c7c3bf7a39f8` | “中文翻译”显示“中文翻译生成失败”，未向页面泄露内部错误码。 |

## 既有报告交叉核对

- `v017_p1_real_device_passed_translation_pending.md` 与 `v003_p1_regression_real_device.md` 在 2026-09-09 明确记录：除 `not_requested` 外的真实样本未覆盖。
- `v085_overseas_translation_worker_regression.md` 仅为 Mock/合同/本地回归，本报告未将其作为真实端到端证据。
- `v116_post_1479316_translation_visibility.md` 已记录同一 completed 内容的真实浏览器可见性；本轮再次在后续真实服务页面复核。
- `v120`、`v121` 反映 2026-09-14 的历史补齐窗口；本轮以 2026-09-16 页面和 API 的当前真实记录为准，避免把当时的“终态计数为零”误作今天没有 pending/retryable/failed 样本。
