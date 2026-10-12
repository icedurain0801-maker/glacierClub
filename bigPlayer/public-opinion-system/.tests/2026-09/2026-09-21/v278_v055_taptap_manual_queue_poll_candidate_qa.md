# v055 TapTap 手动 Run 队列轮询候选 QA

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 测试阶段：隔离候选 QA
- 候选：`C:\ProgramData\PublicOpinion\candidate-staging\worker-release-taptap-20260921-v055`
- 边界：未切换 Worker、未创建 TapTap run、未触历史数据；未操作仍在运行的 BigPlayer run `1c252178-604a-4381-98aa-129bdd0a9ca2`。

## 阶段结论

**阶段性 PASS，待运行时验证。**

本报告只证明发布候选与隔离 Worker 契约通过，不能关闭 TapTap 手动 run 运行时 P0。

## 工件完整性

- `package-worker-release-manifest.json` SHA-256：`11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`。
- 使用仓库 `scripts/windows-services/verify-worker-release.js` 验证候选：`PASS: verified Worker release (407 files)`。
- 候选 `worker/src/worker.js` SHA-256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`。
- 候选文件与本地隔离回归副本的 SHA-256 一致，回归覆盖候选代码。
- `node --check` 通过。

## 隔离回归

- `node --test worker/test/workerUnifiedSchedulerSeam.test.js`：23/23 PASS。
  - 覆盖长 source scan 尚未结束时，新入队 `trigger_type=manual` run 被重新轮询、加入执行集合。
- `node --test worker/test/worker.test.js`：87/87 PASS。
  - 保留既有 TapTap 认领、分页、租约、幂等与失败处理回归。

## 轮询附加 Harness

使用内存 fake repository 和 fake source 执行候选同哈希代码，无数据库、网络或 run 写入：

- 初始长任务：`busy-scheduled-run`。
- 轮询新增：`late-manual-run` 与 `late-scheduled-run`。
- 实际执行顺序：`busy-scheduled-run`、`late-manual-run`；`late-scheduled-run` 未执行。
- `runOnce()` 返回时 `listRunnableSyncRuns` 调用数为 `2`；等待 `600ms` 后仍为 `2`，证明轮询器已经清理。
- 结果：`{ queued: 2, manual: 0, scanned: 0 }`。

## 待运行时验证

待 BigPlayer run `1c252178-604a-4381-98aa-129bdd0a9ca2` 自然终态并取得单次运行授权后，必须补齐：

1. 创建一个有明确样本 ID 的 TapTap `manual/queued` run，同时保持一个可观测长扫描运行中。
2. 记录新 run 的 `runId`、被 claim 的 lease owner/epoch、开始与终态时间和 collection evidence。
3. 真实浏览器打开任务记录与内容页，确认该 run 不是等待到下一轮才执行，且结果与 API/数据库一致。
4. 验收结束后确认无额外 scheduled run 被轮询器提前执行。

在上述运行时证据和独立浏览器记录具备前，v055 总任务不得标记完成。
