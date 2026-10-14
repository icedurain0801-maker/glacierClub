---
status: independent-qa-pass
priority: P0
date: 2026-09-21
---

# Worker mutation probe 参数绑定修复

- 根因：PowerShell `-Command` 后追加的 serviceName、wrapper、XML 参数被解析为脚本文本，未绑定 `$args`，导致 `ParserError` 后门禁超时。
- 修复：新增 `worker-mutation-safety.ps1`，通过 `powershell.exe -File` 与命名参数数组调用；JS helper 负责轮询和 `WORKER_MUTATION_GATE_TIMEOUT` 映射。
- 候选：`.temp/candidates/v057d-worker-cutover-mutation-probe-20260921`。
- manifest 共 10 个文件，逐项验签通过；SHA-256：`469055EBDDAB320FE2D8E3E4D63BACD18321F6E5424E6053E06A595F9ACC41B0`。
- 候选根真实 CLI preflight：PASS，`apiUnchanged=true`，`workerCalls=[]`。
- 真实 PowerShell 子进程 mutation probe：`4/4 PASS`，覆盖带空格路径、活 wrapper、独占文件锁、运行中 Worker 超时且目标字节不变。
- 候选完整回归：`16/16 PASS`；`node --check` 与 `git diff --check` PASS。
- 测试负责人独立复核：10/10 文件 hash 匹配；真实 `--preflight --controller=real` PASS，`apiUnchanged=true`、`workerCalls=[]`；真实 PowerShell probe `4/4`，其余回归 `12/12`。报告 `.tests/2026-09/2026-09-21/v290_worker_mutation_probe_v057d_independent_qa.md`。
- 当前仅获得重新申请唯一受控切换的资格，真实切换及唯一 TapTap run 尚未执行。
- 未执行真实 stop/start/install/copy，未写数据库，未创建 run，未修改 API/3001。

## 唯一 apply 退回

- 唯一一次 v057d apply 通过 mutation gate 后，在 WinSW `install` 阶段失败；服务注册仍存在，WinSW 返回 `A service with ID 'PublicOpinionWorker' already exists`。
- 回滚已恢复原 Worker EXE/XML 字节，但回滚流程再次调用同一 `install`，因此返回 `MANUAL_STOP_REQUIRED`。
- 根因：对已注册服务的文件切换不应无条件重复 `install`；回滚也不应重复该无效操作。
- 已失败即停，不重试、不创建 run；`runId=null`。原 Worker 已通过既有注册直接 `start` 恢复 `RUNNING`，wrapper PID `13548`、Node PID `28780`，仍运行旧 release；Worker/API 哈希未变。
- 证据：`.temp/taptap-v057d-apply-existing-service-install-failure-20260921.json`。
