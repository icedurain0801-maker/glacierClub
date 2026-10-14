# v055 TapTap 手动 run Worker 队列轮询修复

## 根因

Worker 的 `runOnce()` 在每轮扫描开始时只读取一次 `listRunnableSyncRuns()`，随后固定本轮工作集合。长时间 BigPlayer 采集期间新建的 TapTap `manual/queued` run 不会被本轮动态发现，旧 run 因而持续等待，或在 Worker 尚未 claim 前被取消。手动 run 的落库字段与 `claimSyncRun()` 的 queued 状态条件本身匹配。

## 修改

- `worker/src/worker.js`
  - 增加可配置的 `WORKER_QUEUE_POLL_INTERVAL_MS`，默认 5000ms。
  - 长扫描期间仅轮询并处理新出现的 `trigger_type='manual'` runnable run。
  - 复用现有 `runSource()` 与 claim/lease 逻辑，并受现有 source 并发空槽限制。
  - 扫描结束时清理轮询器，不改变周期调度和扫描租约语义。
- `worker/test/workerUnifiedSchedulerSeam.test.js`
  - 增加长任务期间新 queued manual run 被发现并执行的回归测试。

## 验证

- `node --test worker/test/workerUnifiedSchedulerSeam.test.js`：23/23 通过。
- `node --test worker/test/worker.test.js`：87/87 通过。
- `node --check worker/src/worker.js`：通过。

## 未完成项

- 未创建新的 TapTap run，未触发同步，未修改生产配置或历史数据。
- 单次生产验证需等待 BigPlayer run `1c252178-604a-4381-98aa-129bdd0a9ca2` 自然终态后，由负责人按授权流程执行。

## 独立候选与回滚点

- 候选目录：`C:\ProgramData\PublicOpinion\candidate-staging\worker-release-taptap-20260921-v055`
- 候选 `worker/src/worker.js` SHA-256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`
- 候选 `package-worker-release-manifest.json` SHA-256：`11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`
- 候选验证：`verify-worker-release.js` PASS（407 files）；`node --check worker/src/worker.js` PASS。
- 当前 Worker 回滚 release：`C:\ProgramData\PublicOpinion\releases\worker-release-p0-parallel-20260918130000`
- 当前 release `worker/src/worker.js` SHA-256：`A7F8096B45B34D6B9B41DC82987BBE2957369A4B4480BE2910D2078357F61906`
- 当前 release manifest SHA-256：`50304D01F42220322E39150DB7286888E924B030701E3021E7DB86EAD4BFF348`
- 当前服务 XML SHA-256：`1B5C1A69F03C273AA8DF02ABBDF6B90545AFEDBDDD396ED675300873746D5153`
- 当前 WinSW wrapper SHA-256：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`

候选仅写入 `candidate-staging`，未复制到 `releases`，未修改服务 XML、wrapper、当前 release、服务状态或生产数据。

## 2026-09-21 运行时执行阻塞

- 按项目经理授权执行只读预检前置检查；`PublicOpinionWorker` 当前为 `RUNNING`。
- v055 仅存在 `candidate-staging`，缺少真实受控 CLI 要求的固定 `releases` 候选目录、候选 Worker XML 和 `verified-snapshot.json`。
- 错误码：`TAPTAP_CANDIDATE_RELEASE_SNAPSHOT_MISSING`。
- 回滚点与脱敏证据：`.temp/taptap-v055-preflight-blocker-20260921.json`。
- 失败即停：未执行 `stop/install/start`，未写数据库，未创建 TapTap run，未重试。

## formal release 与只读预检

- formal release：`C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1`。
- 候选 Worker XML：`C:\ProgramData\PublicOpinion\candidate-staging\worker-release-taptap-20260921-v055-formal1\services\PublicOpinionWorker.xml`。
- verified snapshot：`C:\ProgramData\PublicOpinion\audit\worker-release-taptap-20260921-v055-formal1\verified-snapshot.json`。
- manifest SHA-256：`11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`，与原 v055 staging 一致。
- `worker/src/worker.js` SHA-256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`，与原 v055 staging 一致。
- snapshot SHA-256：`2401FEE7DB40E3A255E3AAD9581D47BA667EE63CB5837193B6B6FBDE79BD8CA0`。
- controlled-cutover CLI 真实只读 preflight：`PASS`；`apiUnchanged=true`，`workerCalls=[]`。
- 证据：`.temp/taptap-v055-formal-preflight-pass-20260921.json`。未切 live、未控制服务、未写数据库、未创建 run。

## 唯一切换执行结果

- 受控 `--apply --controller=real` 的唯一一次尝试返回 `MANUAL_STOP_REQUIRED`。
- 唯一错误：`EBUSY`；自动回滚同样返回 `EBUSY`。
- 按脚本要求停止并保持仅 `PublicOpinionWorker` 为 `STOPPED`，未重试切换、未启动旧 Worker。
- active Worker EXE/XML 哈希仍分别为 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`、`1B5C1A69F03C273AA8DF02ABBDF6B90545AFEDBDDD396ED675300873746D5153`，XML 仍指向 `worker-release-p0-parallel-20260918130000`；未发生半切换。
- API EXE/XML 哈希未变，未操作其他服务，未写数据库，未创建 TapTap run。
- 证据：`.temp/taptap-v055-single-cutover-ebusy-20260921.json`。

## 原 Worker 紧急恢复与 EBUSY 根因

- 仅使用现有 WinSW 手工启动原 `PublicOpinionWorker`；状态 `RUNNING`，wrapper PID `40832`，Node PID `43432`，启动时间 `2026-09-21 16:26:07 +08:00`。
- Node 命令仍指向 `worker-release-p0-parallel-20260918130000`；Worker EXE/XML 与 API EXE/XML 哈希均保持原回滚点。
- wrapper 日志确认服务启动成功，Worker 日志在 `2026-09-21T08:26:08.501Z` 进入 `scan_started`；进程稳定，无重启循环。
- 数据库只读核对：恢复时间后新增 `po_sync_runs=0`，最新 run 仍创建于 `2026-09-21 14:34:32`。
- 旧 release 的独立 readiness 返回 `UNIFIED_SCHEDULER_SCHEMA_NOT_READY`，作为既有 schema 兼容门禁单独保留，不伪报 readiness PASS。
- `EBUSY` 只读根因：控制器 `stop()` 返回后事务立即覆盖 wrapper，未等待 WinSW/子进程完全退出及文件解锁；日志中 SCM 于 `16:24:33.090` 报 stopped，进程于 `16:24:33.151` 才完成退出。回滚紧接着写同一文件，因此再次 `EBUSY`。
- 恢复证据：`.temp/taptap-worker-original-recovery-20260921.json`。未重试 v055、未创建 run、未修改 API 或其他服务。
