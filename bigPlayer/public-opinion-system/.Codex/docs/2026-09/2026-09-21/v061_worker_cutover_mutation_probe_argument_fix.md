---
status: candidate-ready
priority: P0
date: 2026-09-21
---

# Worker cutover mutation probe 参数修复

- 根因：v057c 使用 `powershell.exe -Command` 后追加 service/wrapper/XML 值，值被解析为脚本文本而非绑定到 `$args`，真实 apply 在 mutation gate 持续 `ParserError` 后超时。
- 修复：新增 `worker-mutation-safety.ps1`，通过 `-File` 和命名参数数组安全传递三个值；`worker-mutation-safety.js` 统一构造参数、启动真实 PowerShell 子进程并负责超时轮询。
- `worker-only-controlled-cutover.js` 只接入上述 helper；stop、复制、安装、启动及事务顺序未变。
- 新增 `v289_worker_mutation_probe_subprocess.test.js`，实际启动 `powershell.exe` 覆盖带空格路径 PASS、活 wrapper 进程 fail-closed、独占文件锁 fail-closed、运行中服务超时且目标字节不变。
- 隔离候选：`.temp/candidates/v057d-worker-cutover-mutation-probe-20260921`。
- 候选内完整测试：v227/v283/v284/v289 合计 `16/16 PASS`，其中真实 PowerShell mutation probe `4/4 PASS`。
- 候选根真实 CLI `--preflight --controller=real`：`PASS`，`apiUnchanged=true`，`workerCalls=[]`。
- 本次未 stop/start/install 服务，未复制真实 Worker 文件，未写数据库，未创建 run，未修改 API/3001。
- 当前仅为待测试负责人独立复核的隔离候选，不代表真实切换或 TapTap run 验收完成。
