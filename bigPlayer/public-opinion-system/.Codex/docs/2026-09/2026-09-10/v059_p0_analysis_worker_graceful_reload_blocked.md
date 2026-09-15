---
last_updated: 2026-09-10
status: blocked
scope: p0-analysis-worker-controlled-reload
---

# v059 P0 analysis Worker 优雅重载受阻

## 启动前影响快照

采样时间：`2026-09-10 10:08:12 +08:00`。

- PID `12800` 持有的 active analysis lease：0。
- PID `12800` 持有的 active sync run：0。
- PID `12800` 持有的 active sync checkpoint：0。
- 因此没有非目标 source 的活动工作，影响范围门禁通过。
- 目标 source `5c21f78d-5f67-4467-963d-dcdeb5e26cab` 保持 disabled。

## 原运行配置

- 启动链：`npm run start:analysis` → `node src/analysisWorker.js`。
- 工作目录：`public-opinion-system/worker`。
- 旧 PID：`12800`。
- `analysisWorker.js` 未注册 SIGTERM/SIGINT 优雅关闭处理器。

## 停止尝试

1. Windows 非强制终止请求被操作系统拒绝，明确提示只能强制终止。
2. 随后向 PID `12800` 所在的独占控制台成功发送 Ctrl+C 事件。
3. 等待后 PID `12800` 仍存活，父启动链也未退出。

稳定阻塞码：`P0_WORKER_GRACEFUL_SHUTDOWN_UNSUPPORTED`。

## 停止点

继续操作需要使用强制终止，超出本单“优雅停止”的授权范围，因此未执行：

- 未强制终止 PID `12800` 或其父进程。
- 未启动替代 Worker，因此没有新 PID。
- 未启用 source、未重跑采集。
- 未修改 analysis jobs、contents、credentials 或 schema。
- 未提交、push 或发版。

下一步需单独拍板：允许在再次确认 PID `12800` 无任何 active lease 后，对该 PID 执行精确强制终止，再按原工作目录和命令隐藏启动 `npm run start:analysis`；或另派代码单为 analysis Worker 增加可验证的优雅退出处理器。
