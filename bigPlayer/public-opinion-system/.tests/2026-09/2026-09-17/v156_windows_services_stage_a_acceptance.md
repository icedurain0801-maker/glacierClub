# v156 Windows 常驻服务阶段 A：只读验收报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 初验结论：**FAIL / BLOCKED**（已修复）
- 复验结论：**PASS**
- 验收边界：仅代码、自动化和 WinSW 静态/安全 dry-run；未安装服务、未写机器环境变量、未停用旧任务、未做真实迁移、未做 24 小时实跑、未 push 或发版。

## 验收审查

### 已覆盖

| 检查项 | 独立证据 | 结果 |
| --- | --- | --- |
| Server 全量回归 | `server` 目录执行 `npm test`，进程退出码 `0` | PASS |
| Worker 全量回归 | `worker` 目录执行 `npm test`，`221/221` 通过、退出码 `0` | PASS |
| 双实例互斥 / owner + epoch 栅栏 | `workerScanLease` 使用数据库 UTC CAS；`renew`、`release` 以 `owner + epoch` 条件更新；Worker 回归覆盖双实例互斥和旧 epoch 栅栏 | PASS |
| 过期恢复 / poison | `recoverExpiredRuns` 限制为每批最多 `100`；达到最大尝试次数写 `SYNC_RUN_POISONED`；Worker 回归覆盖收敛 | PASS |
| Worker 常驻工件 | `PublicOpinionWorker.xml` 指向 `worker/src/worker.js`，`WORKER_MODE=enabled`、扫描间隔 `60000ms` | PASS |
| WinSW 工件静态校验 | `powershell -NoProfile -File scripts/windows-services/validate-artifacts.ps1` 输出 PASS | PASS |
| 安装 / 停用 / 回滚 dry-run | `install-services.cmd /dry-run`、`disable-legacy-tasks.cmd`、`rollback-services.cmd` 均为退出码 `0`，明确未改服务、环境变量、任务或进程 | PASS |
| 恢复 skill 门禁 | `python -X utf8 ...quick_validate.py ...restore-public-opinion-local-service` 输出 `Skill is valid!` | PASS |
| 默认导出门禁复验 | 无参数与 `/dry-run` 均退出 `0` 且仅输出 dry-run；`/unknown`、`/apply one two` 均由脚本返回 `2`；四种非真实导出场景执行后目标 `legacy-task-export` 目录均不存在 | PASS |
| Manual run 数据治理 P0 | Repository 最小回归 `27/27` 通过：活动 run 复用、竞争 run/检查点/调度租约拒绝、事务内内容与 checkpoint 更新、计数累积与 unchanged、run-content 幂等关联 | PASS |
| Worker 重领与异常 P0 | Worker 最小回归 `7/7` 通过：预创建 run 仅 claim 一次、手动/队列去重、旧 owner 不可写入、连接器失败仅记一次、租约丢失停止调度 | PASS |

### 已修复缺陷

1. **P1：旧任务导出脚本默认非 dry-run（已修复并复验）。**
   - 文件：`scripts/windows-services/export-legacy-tasks.cmd`
   - 修复后行为：无参数或 `/dry-run` 只打印计划动作；仅显式 `/apply [output-directory]` 才允许创建目录、查询真实计划任务及写 XML；不支持的参数返回错误。
   - 独立复验证据：无参数执行后目标导出目录仍不存在；`validate-artifacts.ps1` 输出“legacy export defaults to zero-side-effect dry-run and rejects invalid arguments”。

### 待确认

- 真实 DB 断连恢复、WinSW/SCM 拉起、低权限账户读取 `.env` 及日志写权限、24 小时稳定性均明确留在阶段 B；本报告不以静态测试替代这些实测。
- Worker 进程内 `runtimeSupervisor` 尚未接入主入口；当前 5/30/60 秒恢复由 WinSW/SCM 工件承担，符合变更记录声明，但阶段 B 仍须实测。

### 建议补充的验收用例

| 优先级 | 前置条件 → 操作 → 预期结果 |
| --- | --- |
| P1 | 未传 `/apply` → 执行 `export-legacy-tasks.cmd` → 仅打印待执行动作，不创建目录、不查询计划任务、不写 XML。 |
| P1 | 显式 `/apply` 且阶段 B 已获授权 → 导出两个旧任务 → 仅在指定目录生成 XML，导出失败可识别且不改变旧任务。 |
| P2 | 两个 Worker 竞争同一全局扫描租约 → 一个获得 owner/epoch，另一个跳过 → 旧 epoch 的续租、释放与写入均失败。 |
| P2 | 超过恢复上限的过期运行 → 执行一次恢复批 → 最多 100 条处理，毒化记录为 `SYNC_RUN_POISONED` 且不再无界重试。 |

## 阶段 A 结论

`export-legacy-tasks.cmd` 默认 dry-run 门禁已通过独立复验。阶段 A 可关闭并进入阶段 B 高影响门禁评审；阶段 B 的真实 DB 断连恢复、SCM/WinSW 拉起、账户权限及 24 小时稳定性仍须单独授权和实测。
