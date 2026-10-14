# v181 阶段 B1 最终 API-only 安装失败：只读现场复核

- 复核日期：2026-09-17
- 复核角色：测试负责人
- 范围：只读核对 `v180` 失败报告、失败证据目录、SCM 服务状态、实际服务目录及原 API 健康状态。
- 禁止项执行情况：未安装、卸载、启动、停止或重试 Windows 服务；未修改 Worker、旧任务、进程、数据库、`.env`、ACL 或发布状态。

## 复核结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 最终失败结论 | CONFIRMED | `v180` 记录：SCM 账户、延迟启动、恢复策略、hash、路径与 ACL 均通过；启动后 Node 因无法遍历用户目录上层路径触发 `EPERM lstat`，服务最终 Stopped。 |
| API 回滚 | PASS | `PublicOpinionApi` 为 SCM 1060 / 不存在。 |
| Worker 未误安装 | PASS | `PublicOpinionWorker` 为 SCM 1060 / 不存在。 |
| 实际服务目录 | PASS | `C:\ProgramData\PublicOpinion\services` 文件数为 0。 |
| 失败证据保全 | PASS | `.temp/windows-services-stage-b1/failed-deploy-9/` 保留 API EXE、XML、out/err/wrapper 日志。 |
| 原 API 恢复 | PASS | 4320 处于监听（PID 8080）；`/health` 为 HTTP 200，数据库状态为 `ok`。 |
| 其他基础端口 | PASS | 3306、3001 均处于监听。 |
| 外网采集源 API | PASS | `https://lfy3001.dev.q1op.com/api/public-opinion/sources` 返回 HTTP 200，`data` 数量为 1，且存在 `meta`。 |
| 旧计划任务 | PASS | `BigPlayer Last Night Overseas Daily 02`、`BigPlayer Q1 Daily 02` 均为 Ready；`BigPlayer Keep Server Alive` 为 Disabled，与失败前快照一致。 |

## 结论

FAIL 保持成立，回滚与原链路恢复复核通过。WinSW 真实安装必须终止，不得继续重试或放宽用户目录父级 ACL。后续若需重启服务化方案，应由项目经理另行决策机器级受控运行包或专用低权限服务账户，并重新走设计、开发与 QA 门禁。
