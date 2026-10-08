# 真实 PublicOpinionWorker 服务 Adapter：最小实现与验收边界

状态：方案边界，未实现、未授权发布。

## 严格允许目标

Adapter 只接受固定服务名 `PublicOpinionWorker`，且写目标只能是：

- 新建的 `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-<id>`；
- `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe`；
- `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml`；
- 经批准的 Worker-only 审计/回滚目录。

拒绝任何 API、3001、TranslationWorker、数据库、迁移、provider、manual-sync 或全局 rollback 参数/路径。所有输入须为非 reparse point；新 release 必须是 release base 的直接子目录。

## 必需输入与固定门禁

1. 干净 TapTap-only checkout/commit 与仅 cursor hunk 的 diff；不得来自共享脏工作树。
2. 候选 release manifest、`worker/src/worker.js` hash、`verify-worker-release.js` PASS。
3. 只读 WinSW source：`C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback\PublicOpinionApi.exe`，固定 SHA-256 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`；不得改写其目录或复用 API XML/manifest。
4. 新 Worker XML 必须为 `PublicOpinionWorker` id、`LocalService`、候选 Worker entry、候选 `BUILD_SHA`。
5. `verify-worker-only-cutover-plan.js` 在新 release 和真实 Worker snapshot 上 PASS，API wrapper/XML hash 前后一致。

## 事务与 snapshot 挂接

Adapter 在任何 stop 前读取并原子保存：当前 Worker wrapper/XML 字节、XML entry/release、release manifest/hash、SCM 状态和 API/3001 hash+PID+状态。随后将受限 `stop/install/start/state` 方法注入 `worker-only-cutover-transaction.js`；该状态机是唯一切换控制点。

成功后必须断言 Worker 状态 Running、XML entry/BUILD_SHA 指向新 release、Worker readiness PASS，且 API/3001 的 wrapper/XML hash、PID、状态与 snapshot 完全一致。仅观察下一次自然频率触发，禁止补跑。

## 失败口径

- preflight/构建/hash/readiness 失败：不得 stop Worker；只清理本次已授权的新 staging/release。
- stop 后切换失败：状态机自动恢复刚保存的 Worker wrapper/XML、旧 release 引用并仅启动旧 Worker。
- 自动回滚失败：返回 `MANUAL_STOP_REQUIRED`；人工只停止 `PublicOpinionWorker` 并升级项目经理，禁止全局 rollback、禁止 API/3001 操作。
- API/3001 任一差异：fail-closed，保留证据并升级。

## 授权后验收

隔离 adapter 测试至少覆盖：拒绝 API path/service；坏 WinSW hash；坏 manifest；snapshot 失败不 stop；install/start/readiness 失败自动回滚；回滚失败人工口径；每项 API/3001 hash+状态不变。真实切换须用户第二次授权，并按 v007 Runbook 记录每步输出。

## 不可复用与阻塞

不得调用 `rollback-services.cmd`、`install-services.cmd /apply PublicOpinionWorker` 或 API rollback XML/manifest。阻塞仍为：adapter 未实现、无新发布授权、无 TapTap-only clean commit/checkout；多站点工作不在本任务范围。
