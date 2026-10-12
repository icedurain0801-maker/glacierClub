---
status: blocked
priority: P0
date: 2026-09-21
role: test-owner
---

# BigPlayer effective window A 候选独立回归

## 结论

**FAIL，退回开发负责人；不得进入真实 run、切 live 或发版。**

## 候选与验证

- 候选目录：`.temp/bigplayer-comments-a-20260921`
- Worker manifest：`package-worker-release-manifest.json`，407 个文件
- `worker/src/worker.js` SHA-256：`a932a32f55174d1715cfd5eaa36cc57e2668ec03f89d23cae81078bd3030bf75`
- 定向窗口测试：`server/test/bigplayerEffectiveWindow.test.js`，3/3 PASS
- Worker 全量：`worker/test/worker.test.js`，83/88 PASS，5 FAIL

## 失败用例

| 用例 | 结果 | 证据 |
|---|---|---|
| `runSource stops collection when the sync run lease is lost` | FAIL | `worker/test/worker.test.js:1295`，`BIGPLAYER_EFFECTIVE_WINDOW_REQUIRED` |
| `precreated sync run is claimed once without enqueueing a duplicate` | FAIL | `worker/test/worker.test.js:1382`，`BIGPLAYER_EFFECTIVE_WINDOW_REQUIRED` |
| `runOnce executes every runnable scheduled_site child and only marks the source after the parent aggregates` | FAIL | `worker/test/worker.test.js:1468`，实际子任务列表 `[]`，期望 `['first','second']` |
| `BigPlayer multi-site child run resolves its own URL and keeps checkpoints site-scoped` | FAIL | `worker/test/worker.test.js:1654`，`BIGPLAYER_EFFECTIVE_WINDOW_REQUIRED` |
| `BigPlayer multi-site child run fails closed when its saved site is unavailable` | FAIL | `worker/test/worker.test.js:1685`，`BIGPLAYER_EFFECTIVE_WINDOW_REQUIRED` |

## 浏览器与真实运行门禁

- 已新建浏览器标签 61：`http://127.0.0.1:3000/admin/PublicOpinion/sources.html`。
- 静态页面可加载，但 API 上游未就绪，页面显示“社区加载失败，请重试 / 共 0 个账号源”；不能作为真实验收 PASS。
- 3000 仅启动既有 QA 代理；未启动 3001，未触碰 4320/v046、Worker、数据库或生产 sync。
- 未创建新 run、未切 live；因此没有可报告的 runId、API/数据库样本或真实浏览器 PASS 证据。

## 退回要求

开发负责人需修复/补齐上述兼容夹具后重新交测，并一次性交付新的候选路径、manifest/hash、定向结果和 Worker 全量结果。定时路径未实现时仍须保持 BLOCKED，不能由手动路径推导通过。
