---
status: RELEASE_ASSET_MISSING
scope: BigPlayer target/rollback release asset read-only verification
date: 2026-09-22
---

# BigPlayer target / rollback 资产只读核对

## 已核对来源

- 已验证源码当前 commit：`da0ef4fd778f594b71132c338a753722654325c9`。
- 调度窗口修复提交记录：`970165f fix(scheduler): bound BigPlayer scheduled catchup window`。
- 当前 Worker 服务 XML：`C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml`。
- 当前 XML 实际指向：`C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\worker.js`。
- 当前服务路径是 TapTap formal1，不是 BigPlayer v334/v334c；不能作为 BigPlayer target 或 rollback。

## 缺失对象

| 对象 | 期望路径/要求 | 只读结果 | 责任方 |
|---|---|---|---|
| BigPlayer target Worker release | `C:\ProgramData\PublicOpinion\releases\bigplayer-worker-v334c\worker\src\worker.js` | `Test-Path=False`，目录不存在 | 发布方/项目经理提供真实 BigPlayer release 包 |
| BigPlayer target release manifest | 与 target 同目录的 release manifest、source commit、逐文件 SHA-256 | 未发现 | 发布方提供 |
| 上一版 BigPlayer rollback release | 实际上一版 BigPlayer release 绝对目录及 `worker\src\worker.js` | 未提供，无法确认 | 发布方提供 |
| rollback Worker 对象 | 上一版 Worker 文件、SHA-256、目标路径和 `Copy-Item` 恢复命令 | 未提供 | 发布方提供 |
| rollback wrapper/XML | 与 BigPlayer Worker 对应的 wrapper/XML 及 hash | 未提供 | 发布方提供 |

## 排除项

- `worker-release-taptap-20260921-v055-formal1`：当前运行 TapTap formal1，排除。
- `worker-release-p0-*`：历史 P0/通用资产，不能证明 BigPlayer 上一版，排除。
- `v046` API release：仅 API，不是 Worker rollback，排除。
- 任何候选目录中的 `prior release` 泛称：没有真实生产路径和 hash，排除。

## 阻断结论

当前不能构建可审计的 BigPlayer target/rollback 闭环，也不能生成真实 rollback dry-run 输入。不得用 TapTap/P0 资产替代，不得伪造 Worker path、commit、PID、health 或 hash。

## 发布方需补建的最小输入

1. 从已验证 BigPlayer commit 构建独立 target release，给出绝对路径、source evidence、Worker 文件清单和 SHA-256。
2. 提供上一版真实 BigPlayer rollback release，至少包含 Worker 文件、wrapper/XML、manifest 和逐文件 hash。
3. 给出每个目标文件对应的可执行恢复命令，并在不写服务的前提下完成 PowerShell `-WhatIf` 只读验证。
4. 补齐后才能重新运行源头初始化器；本报告之前不创建候选、不发布、不切换、不重启、不真实 Run、不写 DB、不访问 3001。
