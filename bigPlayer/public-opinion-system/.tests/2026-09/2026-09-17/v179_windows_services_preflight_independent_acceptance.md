# v179 Windows 服务完整 preflight：独立验收报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：完整 `/preflight` 隔离回归、账户和 ACL 负向路径、跨 PowerShell validator 回归、四项 dry-run 与准备链静态检查。
- 安全边界：未执行 `/apply`，未安装或控制真实服务；未修改 Worker、旧任务、进程、数据库、`.env`、生产 ACL 或发布状态。

## preflight 隔离回归

| 检查项 | 结果 |
|---|---|
| 含空格 `POWERSHELL_EXE` 路径 | PASS |
| API-only `/preflight` | PASS |
| 错误 WinSW hash | PASS：非 0 退出且 fail-closed |
| 旧/错误服务账户与 ACL 负向路径 | PASS：拒绝 |
| `SERVICE_ROOT` / `SERVICE_LOG_ROOT` 环境变量绕过 | PASS：未被 preflight 采用 |
| SCM、ProgramData 服务文件、监听进程、旧任务 | PASS：测试前后不变 |
| preflight fixture 清理 | PASS：0 残留 |

## 共用准备链静态核对

`install-services.cmd` 的 `/preflight` 与 `/apply` 两个分支均调用 `prepare-services.ps1`：

- `/preflight` 使用 `-Mode Preflight`；
- `/apply` 使用 `-Mode Apply`；
- 两者共享 hash、复制、render、DeploymentRoot ACL 与账户契约准备逻辑。

## 兼容回归与 dry-run

| 检查项 | 结果 |
|---|---|
| Windows PowerShell 5.1：v173、v169、v164、独立 validator | PASS |
| pwsh：v164、独立 validator | PASS |
| install / uninstall / status / rollback 四项无参数 dry-run | PASS，均 exit 0 |

## 结论

PASS。完整 preflight 与真实 apply 共用准备链，能够在隔离目录中覆盖默认 Windows PowerShell 含空格路径、错误 hash、账户与 ACL 失败，并保证生产服务、目录、监听及旧任务零副作用。真实 `/apply` 继续冻结，需等待项目经理新的明确授权。
