# v018 BigPlayer observability 最终独立 QA

- 日期：2026-09-24
- 角色：测试负责人
- 方式：3000 免登录实例只读验收；未重跑真实 Run，未修改真实数据，未解除 `BIGPLAYER_API_SYNC_ENABLED` gate。
- Run：`f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`

## 最终结论

`FAIL_UI_RUNTIME_ACCEPTANCE`

接口修复已在 3000/4320 生效，但运行记录详情页不能完成加载，无法验收页面所需的窗口、帖子/动态、真实评论正文展示；因此不能给出完整 PASS。

## 证据

| 项目 | 结果 | 只读证据 |
| --- | --- | --- |
| Run 窗口 API | PASS | `window_start=2026-09-22 16:00:00.000`、`window_end=2026-09-24 00:56:54.000`，并同时返回 `windowStart/windowEnd`。 |
| contents 分类 API | PASS | posts/comments 行均含 `feed_key/page_kind`；分页 meta 含 `scope`。 |
| 帖子基线与重复 | PASS | posts 全量 209，唯一 ID 209；分类为 `home=151`、`circle=57`、`info=1`。 |
| 评论正文 | PASS | comments scope 返回 `content_type=comment` 及正文，示例“不错”；Run 的 `comment_count=337`。 |
| 真实 Run 状态 | PASS | `completed_authorized_scope`，无 error；`fetched_count=209`。 |
| 详情页面 | FAIL | 新开 3000 页面后社区控件显示“暂无可用社区”，运行列表始终为“加载中…”，未能渲染目标 Run 详情。 |

## 回归门禁

1. 开发负责人需修复/定位 `collection-runs.html` 的运行态加载阻塞（包括社区目录加载与列表/详情初始化）。
2. 修复后仅需对同一 Run 进行一次只读 UI 复验；不得重跑 Run 或解除 gate。
