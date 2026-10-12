---
status: pass_isolated_release_with_no_production_switch
date: 2026-09-22
role: test-owner
topic: BigPlayer Worker v358 隔离发布包独立复核
---

# BigPlayer Worker v358 隔离发布包独立 QA 报告

## 结论

**PASS_ISOLATED_RELEASE_WITH_NO_PRODUCTION_SWITCH**。

v358 隔离 Worker release 的文件闭包、逐文件 hash、运行入口、target/rollback 身份均通过。该结论仅代表隔离资产合格，不代表已切换生产、真实 Run 成功或采集恢复。

## 验证范围与边界

- Runtime：`.temp/releases/bigplayer-worker-20260922-v358/`
- Artifacts：`.temp/releases/bigplayer-worker-20260922-v358-artifacts/`
- 未访问 3001；未执行真实 Run、check-auth、DDL/config 修改、服务切换或重启。
- 未写入 `C:\ProgramData\PublicOpinion`。

## 证据

| 检查项 | 结果 |
|---|---|
| `verify-worker-release.js` | PASS，`411 files` |
| `runtime-checksums.sha256` | PASS，`412 entries / 0 failures` |
| `artifacts-checksums.sha256` | PASS，`4 entries / 0 failures` |
| Worker SHA-256 | `974B80E25023BD60DD946C9D741B176E69BA6317A5489374EEB90985C4DB21A8` |
| sourceCommit | `da0ef4fd778f594b71132c338a753722654325c9` |
| sourceFixCommit | `970165f` |
| Worker XML 入口 | 指向 `C:\ProgramData\PublicOpinion\releases\bigplayer-worker-20260922-v358\worker\src\worker.js`，无 TapTap release 路径 |
| ProgramData target | 不存在；未发现隔离验收写入生产路径证据 |
| 当前服务 | `PublicOpinionWorker` 仍为原运行态；本轮未切换、未重启 |

## target / rollback 身份核验

- target 是 `BigPlayer Worker v358`，不是 TapTap release。
- rollback baseline 是 `pre-bigplayer-taptap-formal1`，含义明确为当前运行中的 TapTap formal1 快照，不是“上一版 BigPlayer”。
- rollback XML、EXE、TapTap Worker 路径及 hash 均已记录；rollback commands 标注 `WhatIf only; no service switch or restart`。

## 遗留风险

该报告不覆盖生产安装后的服务启动、数据库连通、凭据解析、真实采集产出和浏览器端数据恢复；这些必须在后续获得明确生产验收窗口后另行测试。
