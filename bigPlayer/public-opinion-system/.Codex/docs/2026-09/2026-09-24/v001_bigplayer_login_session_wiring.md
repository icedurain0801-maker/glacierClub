# v001 BigPlayer LoginSessionClient 接线修复

## 修复

- `worker/src/worker.js` 的 `buildDeps()` 将已创建的 `loginSessionClient` 注入 `BigPlayerH5Connector`。
- `worker/src/q1DailyJob.js` 的生产预检构造点同步注入该实例。
- 新增离线 wiring contract，验证 worker 实际对象身份和 q1DailyJob 构造参数。

## 安全边界

- 未执行真实 Run。
- 未修改或解除 `BIGPLAYER_API_SYNC_ENABLED` gate。
- 未修改 schema、迁移或其他平台。
