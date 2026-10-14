---
status: PASS_READONLY_FREEZE
date: 2026-09-22
phase: 1
scope: BigPlayer runtime reactivation
---

# v356 阶段 1：运行基线只读冻结

冻结目录：`.temp/v356-runtime-freeze-20260922/`

已保存：

- 95 条 BigPlayer checkpoint 原始备份及 SHA-256 `9E3D8BE8...6F1CE574`。
- schema/ledger/source-site admission 只读结果。
- `PublicOpinionWorker.xml`、当前 Worker release manifest、Worker 文件和非敏感运行配置快照。
- 冻结目录内文件清单：`checksums.sha256.json`。

当前快照仍显示：029 未登记；全局 active checkpoint lease/queued 状态存在变化；运行 Worker 为 TapTap formal1。所有快照均为只读复制，`productionWritesPerformed=false`。

本阶段未删除或修改 run/checkpoint，未执行 DDL、配置写入、服务切换、重启、真实 Run、发布、push 或访问 3001。
