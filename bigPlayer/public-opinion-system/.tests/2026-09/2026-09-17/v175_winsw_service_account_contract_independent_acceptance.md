# v175 WinSW v2 服务账户契约：独立验收报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：WinSW v2 domain/user 服务账户 XML 契约、旧配置拒绝、安装后 SCM 账户 fail-closed 静态门禁、既有校验与零副作用 dry-run。
- 安全边界：未执行 `/apply`，未安装、启动、停止或控制真实服务；未修改 Worker、旧任务、数据库、`.env`、生产 ACL 或发布状态。

## 隔离契约回归

| 检查项 | 结果 |
|---|---|
| 新 API / Worker 模板（`domain=NT AUTHORITY`、`user=LocalService`） | PASS |
| 旧 `username` 配置（failed-deploy-8 证据副本） | PASS：验证器拒绝 |
| `LocalSystem`、缺失 `user`、`allowservicelogon` 未知节点 | PASS：验证器逐项拒绝 |
| 正向 fixture 同进程连续两次 DeploymentRoot 验证 | PASS |
| fixture hash、mtime、ACL 保持不变 | PASS |
| fixture、渲染探针清理 | PASS：均为 0 残留 |

## 兼容回归

| 检查项 | Windows PowerShell 5.1 | pwsh |
|---|---:|---:|
| v169 DeploymentRoot ACL fixture | PASS | 未要求 |
| v164 同进程双跑 | PASS | PASS |
| 独立 `validate-artifacts.ps1` | PASS | PASS |

## dry-run

`install-services.cmd`、`uninstall-services.cmd`、`status-services.cmd`、`rollback-services.cmd` 均无参数运行、均 exit 0，并明确输出未改变服务、任务、进程或文件。

## 静态门禁

| 检查项 | 结果 |
|---|---|
| API / Worker XML 仅保留 domain/user 服务账户字段 | PASS |
| WinSW v2.12.0 SHA-256 锁定 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` | PASS |
| 安装后 SCM 查询 | PASS：`sc.exe qc` 读取 `SERVICE_START_NAME` |
| LocalService 硬断言 | PASS：仅接受 `NT AUTHORITY\LocalService` |
| 失败保全与自动卸载 | PASS：`account_failure` 保全非敏感证据后对已选服务执行 uninstall |

## 结论

PASS。隔离服务账户契约与 fail-closed 安装后账户门禁完整通过；此前 LocalSystem 失败路径不会被放行。真实安装仍须等待项目经理解除冻结并另行派单。
