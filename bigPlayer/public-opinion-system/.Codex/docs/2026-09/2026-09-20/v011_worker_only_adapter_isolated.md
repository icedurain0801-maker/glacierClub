# Worker-only adapter 隔离最小件

新增 `public-opinion-worker-only-adapter.js`：无 CLI、无 ProgramData/服务发现能力；仅接受 `PublicOpinionWorker`、非链接文件、固定 WinSW hash 与注入的 Worker ops，并挂接既有事务状态机。拒绝 API service 名称；失败沿用仅 Worker 自动回滚/`MANUAL_STOP_REQUIRED`。

`v228_worker_only_adapter.test.js` 通过：拒绝 API 名称；readiness 故障回滚且 API 文件不变。未操作真实服务、数据库或同步。

```powershell
node --test .tests/2026-09/2026-09-20/v228_worker_only_adapter.test.js
# 2 passed
```
