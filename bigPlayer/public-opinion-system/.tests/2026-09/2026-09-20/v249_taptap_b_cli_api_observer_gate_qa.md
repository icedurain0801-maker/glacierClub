# v249 TapTap Worker-only B CLI API 观察参数门禁 QA

- 测试日期：2026-09-20（北京时间）
- shell：Windows PowerShell 5.1 外壳启动真实 B CLI 隔离入口
- 边界：第六候选只读保留；未续跑 B/D，未操作服务、重启或补跑

## 逐项结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| `--api-wrapper/--api-xml` 观察参数 | PASS | 仅用于 hash/snapshot 只读校验，可通过合同门禁 |
| API/3001 target/source/copy/switch/service 越权 | PASS | 在输入处理前返回 `WORKER_ONLY_TARGET_REJECTED` / exit 5 |
| fake 全流程回归 | PASS | stop/install/start/readiness/rollback 与工件门禁均通过 |
| Windows PowerShell 5.1 B 入口 | PASS | `powershell.exe -Command "node --test ...v229_worker_only_controlled_cli.test.js"`，14 passed / 0 failed |
| Node/parser/diff | PASS | v229 14/14；CLI `node --check`；`git diff --check` 无失败 |
| 临时残留 | PASS | `po-cli-input-*` 无残留 |

## 结论

B CLI API 观察参数与 API 部署目标区分 **PASS（隔离）**。满足申请第七个新 CandidateId 的 QA 前置条件；第七真实 C+B 仍冻结，必须取得新的弹窗授权后才能执行。
