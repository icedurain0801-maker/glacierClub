# v017 BigPlayer 真实运行可观测性独立 QA

- 日期：2026-09-24
- 角色：测试负责人
- 范围：只读复核 v017 observability 修复；未重跑真实 Run，未写入或删除数据。
- 运行实例：`http://127.0.0.1:3000`（免登录实例）
- 真实 Run：`f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`

## 结论

`FAIL_RUNTIME_OBSERVABILITY_NOT_EFFECTIVE`

v017 源码变更虽存在于工作树，但 3000 运行态 API 与页面均未呈现该变更，不能解除真实运行验收门禁。

## 只读证据

| 验收项 | 预期 | 3000 实际结果 | 结论 |
| --- | --- | --- | --- |
| Run 窗口 | `window_start/window_end` 及 camelCase | `GET /api/public-opinion/sync-runs/f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9` 的响应字段中不存在这四项 | FAIL |
| 内容分类依据 | contents 行包含 `feed_key/page_kind` | posts、comments 首行字段均不存在该二项 | FAIL |
| 评论正文 | comments scope 可读取实际正文 | API 返回 `content_type=comment`，正文示例为“不错” | PASS |
| 基线数据 | Run 数据不被回归破坏 | `completed_authorized_scope`；`fetched_count=209`、`comment_count=337`、无错误 | PASS |
| 管理页面 | 详情应呈现窗口、帖子/动态、评论正文分层 | 新开页面 `collection-runs.html?runId=...` 持续显示“加载中…”，未渲染列表或详情 | FAIL |

## 缺陷与退回项

1. 3000 所代理的运行态未加载或未部署 v017 的 API 投影：窗口字段和 `feed_key/page_kind` 均缺失。
2. 运行记录页发生加载阻塞，无法验收窗口、帖子/动态和评论正文 UI；需先定位浏览器端异常/接口接线后再交测。

## 剩余门禁

- 真实 Run gate 保持关闭。
- 开发负责人完成运行态生效与页面加载修复后，重新交测；测试仅执行只读复验，不重跑该真实 Run。
