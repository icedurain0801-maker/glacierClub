# P0 Analysis Claim 隔离修复独立回归验收报告

- 日期：2026-09-10
- 角色：测试负责人
- 范围：`server/src/db/repository.js`、Q1 manual analysis runner/job 及对应测试
- 边界：只读代码审查与零数据库 Node 测试；未恢复目标 source、重跑采集、操作 PID `12800`、删除数据、提交或发版。

## 结论

**PASS。** Claim 隔离修复满足验收门槛，准入项目经理安排的“无竞争条件下恢复精确 source 并执行一次隔离 manual 真实采集”。本结论不等同于此前页面验收通过，真实数据仍需在任务终态后按 DB → API → 页面重新验收。

## 验收结果

| 门槛 | 结果 | 证据 |
|---|---|---|
| disabled source 全局 claim | 通过 | 普通 `_claimAnalysisJobsOnce` 强制 `s.enabled=1`，全局 Worker 对 disabled source 不可 claim |
| enabled source backlog | 通过 | 非 bypass 路径保留 enabled source 的既有 claim SQL；repository 全套 `84/84` 通过 |
| manual / Worker 隔离 | 通过 | 普通 Worker 排除 `q1-daily` 审计 lease；manual runner 使用 `q1-daily:<pid>:<sourceId>:<businessDate>` 基础 owner，仓储 claim 追加唯一 claim 标识 |
| disabled bypass 完整门禁 | 通过 | bypass 缺少 sourceId、非空 contentIds、publishedFrom、publishedTo、businessDate 或合规 owner 任一项，均抛 `ANALYSIS_CLAIM_SCOPE_REQUIRED`，且无数据库调用 |
| manual 精确范围 | 通过 | Q1 manual runner 传递 `allowDisabledSource=true`、精确 contentIds、日期窗、businessDate 与 auditable owner |
| scheduled 无 bypass | 通过 | `runQ1Daily` 仅 `triggerType='manual'` 才启用 manual claim；scheduled 保持默认普通 claim 门禁 |
| 定向回归 | 通过 | repository `84/84`；Q1 analysis runner、Q1 job、worker 集合 `90/90`；共 `174/174` |
| 静态检查 | 通过 | 三个变更模块 `node --check` 通过；指定六文件 `git diff --check` 通过 |

## 范围说明

当前工作树仍含并行未提交变更。本报告仅认证上述 analysis claim 隔离行为及其定向回归，不认证整个工作树相对 `HEAD` 的变更归属或窄 diff。

## 后续门禁

目标 source 仍应保持 disabled，直至项目经理建立无竞争执行计划。恢复后单次真实采集必须获得任务终态；随后由测试负责人执行精确 DB、API、用户页面的非零一致性验收。
