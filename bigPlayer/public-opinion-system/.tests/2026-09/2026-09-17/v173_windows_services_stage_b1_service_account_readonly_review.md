# v173 阶段 B1 API 服务账户失败：只读复核

- 复核日期：2026-09-17
- 复核角色：测试负责人
- 范围：只读核对 `v172` 安装失败报告、保全工件、回滚服务状态、部署目录、基础端口与健康状态。
- 禁止项执行情况：未安装、卸载、启动、停止或重试服务；未修改 Worker、旧任务、进程、数据库、`.env`、ACL、代码或发布状态。

## 复核结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 服务账户门槛失败 | CONFIRMED | `v172` 显示 XML 配置为 `NT AUTHORITY\LocalService`，安装后的 SCM `StartName` 却为 `LocalSystem`；服务从未启动。 |
| API 回滚 | PASS | `PublicOpinionApi` 为 SCM 1060 / 不存在。 |
| Worker 未误安装 | PASS | `PublicOpinionWorker` 为 SCM 1060 / 不存在。 |
| 实际服务部署目录 | PASS | `C:\ProgramData\PublicOpinion\services` 文件数为 0。 |
| 失败证据保全 | PASS | `.temp/windows-services-stage-b1/failed-deploy-8/` 保留 API EXE、XML 与 wrapper 日志；并非实际服务目录。 |
| 基础运行态 | PASS | 3306、4320、3001 均监听；`http://127.0.0.1:4320/health` HTTP 200，数据库状态为 `ok`。 |

## 结论

FAIL 保持成立，回滚复核通过。SCM 服务账户实际落为 LocalSystem，违反 API 必须以 LocalService 运行的硬门槛，具有权限提升风险。应由开发负责人先定位 WinSW v2 服务账户配置未生效原因，并新增“安装后 `StartName=LocalService`”的回归或安装期断言；在此之前不得再次真实安装或进入 Worker。
