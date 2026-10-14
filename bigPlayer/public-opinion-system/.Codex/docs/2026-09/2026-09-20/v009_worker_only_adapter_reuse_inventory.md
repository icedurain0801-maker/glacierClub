# TapTap Worker-only 发布 Adapter：只读复用盘点

状态：仅盘点；未改脚本、未执行发布动作。

## 可直接复用

| 责任 | 现有组件 | 结论 |
|---|---|---|
| 运行包构建 | `build-worker-release.ps1`、`copy-worker-runtime.js` | 可复用；只对新 release root 写入，须从干净 TapTap-only checkout 调用 |
| 运行包闭包/manifest | `verify-worker-release.js` | 可复用；只读复算候选包 |
| Worker preflight/ACL/readiness | `prepare-worker-preflight.ps1`、`validate-artifacts.ps1`、`worker-readiness.js` | 可复用为授权后的 staging 门禁；Preflight 只在 `.temp` 建立并清理 fixture |
| WinSW 固定 hash | `prepare-worker-preflight.ps1` | 可复用；固定 hash 与既有 rollback 源一致 |
| Worker-only候选/API快照 | `verify-worker-only-cutover-plan.js` | 可复用；只读 fail-closed，拒绝 API material |
| 事务状态机 | `worker-only-cutover-transaction.js` | 可复用；无 CLI，已覆盖失败自动 Worker rollback 与 API 不变 |
| 服务状态读取 | `status-services.cmd /query` | 仅可作发布前后观察；它会查询 API，不能作为切换组件 |

## 不可复用

- `rollback-services.cmd`：同时 stop/uninstall API 与 Worker，禁止。
- `install-services.cmd /apply PublicOpinionWorker`：不先保存经验证 Worker-only snapshot，失败不保证恢复旧 Worker，不能作为本次 adapter。
- `remove-worker-release.ps1`：会删除 Worker service artifacts，只能用于已授权失败清理，不能充当回滚。
- API rollback 目录中的 XML/manifest：API 专用；仅其 WinSW `.exe` 可作为只读二进制来源。

## 最小缺失 adapter 责任

只缺一个授权后注入 `worker-only-cutover-transaction.js` 的真实 **Worker service adapter**：限定 `PublicOpinionWorker`，实现 stop/install/start 与服务状态读取，并在调用前把当前 wrapper/XML/release 指针保存到经批准的 Worker-only审计目录。它不得接受 API/3001 service 名称、数据库或同步参数。

## QA 通过后的最小项目经理动作

1. 获得用户两次授权：新 Worker release 构建，以及具体切换时点。
2. 提供干净 TapTap-only commit/checkout；复跑 v226/v227 与 candidate manifest/hash。
3. 让负责人实现并隔离验收上述最小 adapter；确认 API/3001 hash、PID、状态快照。
4. 才可按 v007 Runbook 进行 Worker-only staging 和切换；自然频率观察，不补跑。

阻塞：真实 adapter 尚未实现；当前共享工作树仍不可打包；用户发布授权尚未给出。
