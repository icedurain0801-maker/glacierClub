# v012 BigPlayer 多站点父 Run 控制 fail-closed

- 日期：2026-09-20
- 范围：A' 第三段补充；不做父子传播或终态 fencing，不执行真实数据库、迁移、服务操作或补跑。

## 变更

- Run 投影增加 `hasScheduledSiteChildren` / `has_scheduled_site_children`，仅在父 Run 实际存在 `scheduled_site` 子任务时为真。
- `POST /sync-runs/:id/pause` 与 `cancel` 对该类父 Run 返回 `409 MULTISITE_PARENT_CONTROL_UNSUPPORTED`，且在进入 repository 状态更新前返回。
- 前端父汇总禁用全部控制按钮并展示等待子站点完成的说明；子站点和旧单站继续按原 Run ID 控制。

## 验证

- 接口合同：父 pause/cancel 返回稳定 409 且未调用状态更新；child 与 legacy pause 仍返回 200。
- `node --test server/test/repository.test.js`：139/139 通过。
- `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`：8/8 通过。
- API 定向测试：1/1 通过。
- `node --check`（app/repository/dock）和 `git diff --check`：通过。

## 边界

- 父子 pause/cancel 传播、子 Run 安全页结算与父终态 fencing 是后续独立切片；本次明确拒绝，避免显示成功但子站点继续执行。
