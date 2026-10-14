---
status: independent-qa-pass
priority: P0
date: 2026-09-21
---

# Worker cutover 真实预检完整候选

- v057b 因缺 `worker-readiness.js` 在真实 preflight 阶段退回；未执行 apply 或创建 run。
- 新候选：`.temp/candidates/v057c-worker-cutover-ebusy-gate-20260921`。
- 新增 `scripts/windows-services/worker-readiness.js`；其本地依赖仅为 Node 内置 `node:path`，业务模块从已验签的 formal1 release 加载。
- manifest 共 7 个文件，逐项 SHA-256 验签通过；manifest SHA-256：`1CCDA24C3CBC5FE766A2838EAF8BB96A1A694016130255773524319E153DEB02`。
- 从 v057c 候选根目录使用真实 CLI `--preflight --controller=real`：PASS，`apiUnchanged=true`，`workerCalls=[]`。
- readiness 在进程内禁止 `SELECT/SHOW` 以外的 SQL；数据库只读核对预检窗口新增 run 为 `0`。
- 原 Worker 保持 `RUNNING`、PID `40832`，Worker/API active 哈希均未变化；`serviceActions=0`、`databaseWrites=0`、`runCreated=false`。
- 候选内 fake preflight 补充 PASS；v227/v283/v284 合计 `12/12 PASS`。
- 测试负责人独立复核：7/7 文件 hash 匹配；候选根真实 `--preflight --controller=real` 返回 PASS、`apiUnchanged=true`、`workerCalls=[]`；Worker 保持 Running、active hash 未变、预检窗口新增 run=0。报告 `.tests/2026-09/2026-09-21/v288_worker_cutover_v057c_real_preflight_qa.md`。
- 当前仅获得重新申请唯一受控切换的资格，真实切换和唯一 TapTap run 尚未执行。
- 未执行 stop/start/apply，未创建 TapTap 或 BigPlayer run，未修改 API/3001。

## 唯一 apply 退回

- 获授权后唯一一次 apply 返回 `MANUAL_STOP_REQUIRED / WORKER_MUTATION_GATE_TIMEOUT`，`rollbackSkipped=true`，候选/回滚文件均未写入。
- 根因：真实 mutation probe 使用 PowerShell `-Command` 后追加参数，`PublicOpinionWorker`、wrapper、XML 路径被拼接为脚本文本而非绑定到 `$args`，产生 `ParserError`，门禁持续 fail-closed 直至超时。
- 已按失败即停，不重试、不创建 run；`runId=null`。
- 原 Worker 已恢复 `RUNNING`，wrapper PID `49520`、Node PID `45000`，仍运行 `worker-release-p0-parallel-20260918130000`；Worker/API active 哈希均未变化。
- 证据：`.temp/taptap-v057c-apply-mutation-probe-parser-failure-20260921.json`。
