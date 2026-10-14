# v230 BigPlayer 多站点 Worker 子 Run 切片验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：Worker 隔离 mock 回归
- 边界：未执行真实 `027` 迁移、部署、重启、补跑或发版；共享在途改动未纳入本单行为结论

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| child Run siteId URL 上下文 | PASS | 定向用例验证子 Run `site_id=second` 精确解析保存的启用 `config.siteUrls`，connector source 使用 second URL，并覆盖本次 `baseUrl` |
| checkpoint siteId 隔离 | PASS | 定向用例验证 get/claim checkpoint 均传 `siteId=second`，站点上下文不串用 |
| 缺站点 fail-closed | PASS | 定向用例返回 `MULTISITE_SITE_CONTEXT_NOT_FOUND`，connector 不执行采集，不回退首站 |
| 定向 Worker 回归 | PASS | `node --test --test-name-pattern "BigPlayer multi-site child run\|BigPlayer multi-site" worker/test/worker.test.js`，2 passed / 0 failed |
| Worker 全量回归 | PASS | `node --test worker/test/worker.test.js`，86 passed / 0 failed |
| 语法/空白 | PASS | `node --check worker/src/worker.js`；`git diff --check -- worker/src/worker.js worker/test/worker.test.js` 通过 |

## 关键行为

1. 子 Run 使用自身 `site_id` 从已保存且启用的 `config.siteUrls` 中解析 URL。
2. 子站点 URL 会覆盖本次连接器上下文的 `baseUrl`，不会继续使用父源首站。
3. checkpoint 查询和领取携带同一 `siteId`，站点之间保持独立。
4. 保存的站点不存在时稳定失败并返回 `MULTISITE_SITE_CONTEXT_NOT_FOUND`，不回退第一站、不发起采集。

## 结论

BigPlayer 多站点 Worker 子 Run 切片 **PASS（隔离 mock）**。未连接真实 DB、未运行真实服务，不能将该结果外推为真实迁移、线上采集或发版通过。
