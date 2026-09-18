# v017 Windows 服务完整 preflight

## 变更

- `prepare-services.ps1`：集中实现 apply/preflight 共用的 WinSW v2.12.0 SHA-256、复制、render 与 DeploymentRoot 校验；hash 使用纯 .NET 实现。
- `install-services.cmd`：新增 `/preflight <target>`，移除带空格路径不安全的 `for /f` hash 命令；真实 `/apply` 改为调用同一 helper。
- `validate-artifacts.ps1`：校验共享 helper、preflight 含空格隔离路径、hash 实现和安全清理门禁。
- `v177_windows_services_preflight.test.ps1`：覆盖含空格 PowerShell 路径、API-only、错误 hash、错误账户、ACL 失败、环境覆盖拒绝和系统状态零副作用。

## 验证

- 新 preflight、v177、v173、v169、v164、Windows PowerShell/pwsh 独立 validate 全部 PASS。
- 四个 dry-run 全部退出码 0。
- 所有隔离目录残留为 0；SCM、ProgramData、监听进程与旧任务前后不变。
- 未执行真实 `/apply`。
