# v171 validate-artifacts DeploymentRoot ACL 路径：独立验收报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：隔离 DeploymentRoot fixture 的 ACL 路径回归、既有重入回归、独立校验与四项 dry-run。
- 安全边界：未执行 `/apply`，未安装/卸载/控制真实服务，未触及 Worker、旧任务、进程、数据库、`.env`、生产 ACL 或发版。

## 结果

| 检查项 | Windows PowerShell 5.1 | pwsh | 结果 |
|---|---:|---:|---|
| v169：真实 `DeploymentRoot` / API-only fixture | PASS | 未要求 | PASS |
| v169 同一进程连续两次校验 | PASS | 未要求 | PASS |
| v169 未授权 Allow ACE 负向校验 | PASS（被拒绝） | 未要求 | PASS |
| v169 fixture hash、mtime、ACL 不变 | PASS | 未要求 | PASS |
| v169 fixture 与渲染探针清理 | PASS | 未要求 | PASS |
| v164：无 DeploymentRoot 的同进程双跑 | PASS | PASS | PASS |
| 独立 `validate-artifacts.ps1` | PASS | PASS | PASS |

## dry-run

以下四项均无参数运行、均 exit 0：

| 脚本 | 结果 |
|---|---|
| `install-services.cmd` | PASS，明确未改变服务、环境变量、任务或进程。 |
| `uninstall-services.cmd` | PASS，明确未改变服务、文件、任务、环境变量或进程。 |
| `status-services.cmd` | PASS，明确未改变服务、文件、任务、环境变量或进程。 |
| `rollback-services.cmd` | PASS，明确未改变服务或任务。 |

## 安装态保护复核

- `PublicOpinionApi`：SCM 1060 / 不存在。
- `PublicOpinionWorker`：SCM 1060 / 不存在。
- `C:\ProgramData\PublicOpinion\services`：0 文件。

## 结论

PASS。`DeploymentRoot` 的 API-only ACL 校验路径在 Windows PowerShell 5.1 中可重入、能拒绝未授权 Allow ACE，且不会修改隔离 fixture。既有无 DeploymentRoot 重入校验与独立 validator 在 Windows PowerShell 5.1、pwsh 中均通过；四项 dry-run 全部为零副作用退出。
