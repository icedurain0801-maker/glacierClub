---
last_updated: 2026-09-09
status: completed_with_base_dependency
scope: scheduler-stage6b
---

# v046 Stage 6B：6A 专属 Patch 工件

## 结论

已从当前混合工作树中精确提取阶段 6A 门禁、三份关联测试及 v045 审计文档，生成独立 patch 工件。该 patch 在隔离的 pre-6A composite 基线上通过 `git apply --check`、实际 apply 和三个定向零 DB 测试。

该 patch **不能直接应用到纯 `HEAD`**。它依赖目标文件中已存在但尚未提交的前置改动，因此工件名称、验证日志和本记录均显式标注这一限制。

## 工件

- Patch：`bigPlayer/.temp/stage6b-6a-exclusive-20260909/v046_stage6a_exclusive_requires_pre6a_composite.patch`
- 验证日志：`bigPlayer/.temp/stage6b-6a-exclusive-20260909/v046_stage6a_exclusive_validation.log`
- Patch SHA256：`CB911A6E6A3AAD317CB3C397C7000EAF74DC30F30D3ED51C62088A767779881E`

Patch 共包含 7 个路径：daily、Q1、installer 三个生产文件，三份 6A 测试，以及 v045 在范围审计完成时的文档快照。v046 是 patch 构造记录，不纳入 patch，避免自引用工件。

## 精确前置基线

| 文件 | pre-6A composite blob |
|---|---|
| `worker/install-q1-daily-task.cmd` | `fde185f752704bc0f79dbf7f96efbf2d2808466c` |
| `worker/src/dailyRunner.js` | `8ebb52af343aedc12ecd310e01dc65511fcaf83f` |
| `worker/src/q1DailyJob.js` | `d9a67d006ac9b52eaaf2b60b765b17032e60b861` |
| `worker/test/dailyRunner.test.js` | `dbdfccbce4f3585669b5e92b87a4ab7d2427f153` |
| `worker/test/q1DailyJob.test.js` | `01d65b4854848f8d20acc054258da7dc5e26c439` |

此外，`worker/test/q1DailyTaskInstaller.test.js` 与 v045 文档在基线上必须不存在。

## 验证结果

- pre-6A composite 隔离副本：`git apply --check` 退出码 0。
- 隔离实际 apply：退出码 0，7 个路径全部 cleanly applied。
- 与当前源文件比较：忽略 CRLF/LF 后，7 个重建结果全部一致。
- 定向测试：3 passed，0 failed，0 skipped。
- 纯 `HEAD` apply check：退出码 1，符合预期。

纯 `HEAD` 缺少的精确前置依赖：

1. installer 的 dry-run、validate、verify 结构；第二组受控切换提示依赖该结构。
2. dailyRunner 的 analysis-scope/claim-lock 既有改动上下文及混合导出行。
3. q1DailyJob 的 `beijingDayWindow`、options/scope/report 既有重构上下文及混合导出行。

因此本工件不能作为“从 HEAD 独立应用”的补丁传播。应用前必须逐个核对上述 blob；不匹配时应重新从目标基线构造，不得强制 apply。

## 安全边界

- patch 构造与验证均位于 `bigPlayer/.temp/`。
- 未修改当前 Git index。
- 未修改任何业务源文件。
- 未连接数据库，未启动 Worker、Windows task、crawler 或采集。
- 未暂存、提交、push 或发版。
