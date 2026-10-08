---
status: candidate-qa
priority: P0
date: 2026-09-21
---

# Worker cutover EBUSY mutation gate

## 修改

- `worker-only-controlled-cutover.js` 在 stop 后轮询确认服务为 Stopped、WinSW wrapper 与 Worker Node 进程退出，并同时以 `FileShare.None` 独占打开 wrapper/XML。
- `worker-only-cutover-transaction.js` 只在门禁通过后写候选；首次门禁超时返回 `WORKER_MUTATION_GATE_TIMEOUT` 且跳过回滚写入，目标字节保持不变。
- 已发生候选写入后的回滚也必须重新 stop 并通过同一门禁；回滚门禁超时不得写回滚字节。

## 隔离候选

- 路径：`.temp/candidates/v057-worker-cutover-ebusy-gate-20260921`
- manifest SHA-256：`E0D15816FA436941E756B6EC0331882A58FB15F8DD1C705207A3C2965C774A4A`
- transaction SHA-256：`E58DF6D5C1FAF9545B9DA719AAAAA39A4E53B765B3D03CA82795FD9B4A803A89`
- controlled CLI SHA-256：`C22CF5816182D2108887DDA6D57AE65FED7207A3151EC25A31059EBDD56ADA45`

## 验证

- 新增门禁及既有事务/CLI 回归：`31/31 PASS`。
- 候选内定向测试：`9/9 PASS`。
- 补充 EBUSY 进程/独占访问模拟：`v283_worker_cutover_mutation_gate.test.js` 与 `v284_worker_cutover_ebusy_simulation.test.js` 合计 `7/7 PASS`；记录见 `v058_worker_cutover_ebusy_test.md`。
- formal1 真实只读 preflight：`PASS`；`apiUnchanged=true`，`workerCalls=[]`。
- `node --check` 与 `git diff --check`：PASS。
- 未执行真实 stop/install/start，未写数据库，未创建 run，未修改 API。
