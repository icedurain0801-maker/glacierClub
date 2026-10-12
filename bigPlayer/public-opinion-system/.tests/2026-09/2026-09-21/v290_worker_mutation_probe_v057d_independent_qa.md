---
status: pass
priority: P0
date: 2026-09-21
role: test-owner
---

# v057d Worker mutation probe 参数绑定独立复核

## 结论

**PASS（仅候选隔离/真实只读 preflight）。** v057d 修复了 PowerShell 参数绑定问题，具备重新申请唯一受控切换的测试资格；本轮未执行真实 stop/start/copy/apply，不代表切换完成。

## 候选与 manifest

- 候选：`.temp/candidates/v057d-worker-cutover-mutation-probe-20260921`
- manifest SHA-256：`469055EBDDAB320FE2D8E3E4D63BACD18321F6E5424E6053E06A595F9ACC41B0`
- 10/10 文件逐项 SHA-256 匹配
- `worker-mutation-safety.ps1`、`worker-readiness.js` 及完整 CLI 依赖均存在

## 独立重放

- 候选根真实 `--preflight --controller=real`：PASS；`apiUnchanged=true`、`workerCalls=[]`
- 真实 PowerShell 子进程 mutation probe：4/4 PASS
  - 带空格路径的命名参数绑定
  - wrapper 存活时 fail-closed
  - 独占文件锁时 fail-closed
  - 运行中 Worker 超时且目标字节不变
- v227：5/5 PASS
- v283：4/4 PASS
- v284：3/3 PASS
- 候选测试合计：16/16 PASS
- `node --check`：PASS
- `git diff --check`：PASS

## 副作用核对

- `PublicOpinionWorker` 仍为 `Running`
- 未执行真实 stop/start/install/copy
- 未写数据库、未创建 run、未修改 API/3001

## 交接

已回执项目经理：v057d 独立 PASS，可重新申请唯一受控切换。真实切换后仍必须提供唯一 runId，再独立验收 claim/lease、时间戳、终态/计数和浏览器页面。
