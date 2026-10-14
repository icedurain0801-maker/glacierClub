# v178 Windows 服务完整 preflight 回归

- 日期：2026-09-17
- 结论：**开发自测 PASS，等待独立 QA**
- 边界：真实 `/apply` 全程冻结；未安装/控制服务，未修改 Worker、旧任务、数据库、`.env`、生产 ACL、进程或发布状态。

## 实现

- 新增 `prepare-services.ps1`，由 `/preflight` 与 `/apply` 共用同一套 WinSW hash、目标复制、XML render、DeploymentRoot ACL 和账户契约校验链。
- `/preflight PublicOpinionApi|PublicOpinionWorker|All` 强制在仓库根 `.temp/windows services preflight <guid>/` 下执行；service/log 子目录均含空格，不接收 `SERVICE_ROOT`/`SERVICE_LOG_ROOT` 环境覆盖，`finally` 做路径边界校验后清理。
- hash 改用纯 .NET `System.Security.Cryptography.SHA256`，不再通过脆弱的 batch `for /f` 拼接 PowerShell 命令，也不依赖模块自动加载。
- 无参数与 `/dry-run` 保持原零副作用行为。

## 回归结果

| 检查项 | 结果 |
| --- | --- |
| v177：含空格 `POWERSHELL_EXE` wrapper | PASS |
| v177：API-only preflight | PASS |
| v177：错误 WinSW hash | PASS：非 0、明确拒绝 |
| v177：错误账户 | PASS：由 v173 正负契约覆盖 |
| v177：ACL 失败 | PASS：由 v169 未授权 Allow ACE 覆盖 |
| v177：环境根目录绕过 | PASS：未创建环境指定路径 |
| v177：SCM/ProgramData/监听 PID/旧任务 | PASS：前后不变 |
| Windows PowerShell 5.1：v173/v169/v164/validate | PASS |
| pwsh 7.6.5：v164/validate | PASS |
| install/uninstall/status/rollback dry-run | 全部退出码 0 |
| preflight/回归/account/ACL/render 临时目录 | 残留均为 0 |
| `git diff --check` | PASS |

## 开发过程失败记录

1. 首次 preflight 使用 `Get-FileHash`，Windows PowerShell 无法自动加载 `Microsoft.PowerShell.Utility`，ErrorRecord 为 `CommandNotFoundException,prepare-services.ps1`；改为纯 .NET SHA-256 后通过。
2. helper 接线后，校验器仍要求旧的 install 内联 `-OutputDirectory "%SERVICE_ROOT%"`，ErrorRecord 为 `Rendered XML is not written beside wrappers` / `RuntimeException`；静态断言改为检查共享 helper 的 `$effectiveServiceRoot` 后通过。
3. v177 首次错误-hash 用例因全局 `ErrorActionPreference=Stop` 将预期 native stderr 提升为 `NativeCommandError`；局部使用 `Continue`、仍严格断言非 0 和错误标记后通过。

共同诊断环境：Windows PowerShell `5.1.19041.3803`；`PSModulePath=C:\Users\Administrator\Documents\WindowsPowerShell\Modules;C:\Program Files\WindowsPowerShell\Modules;C:\Windows\system32\WindowsPowerShell\v1.0\Modules`；Security 模块 `3.0.0.0`、Utility 模块 `3.1.0.0`，均位于 `C:\Windows\system32\WindowsPowerShell\v1.0\Modules\`。所有失败均发生在隔离 preflight/测试中，无生产副作用。
