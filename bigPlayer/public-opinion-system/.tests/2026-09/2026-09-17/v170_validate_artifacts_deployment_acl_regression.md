# v170 WinSW 部署 ACL 校验路径回归

- 日期：2026-09-17
- 结论：**开发自测 PASS**
- 边界：仅使用仓库根 `.temp` 隔离 fixture；未执行 `/apply`，未安装服务，未修改真实服务、旧任务、数据库、`.env` 或生产 ACL，未读取或回显秘密。

## 修复

- `validate-artifacts.ps1` 使用既有 `FileInfo` 的 `.GetAccessControl(Access)` 读取 ACL，不再依赖 `Get-Acl` 自动加载，也不显式导入安全模块或吞异常。
- 单服务部署成功文案不再误报“双 wrapper hash”；只有 `All` 模式报告两个包装器 hash 一致。
- 新增 `v169_validate_artifacts_deployment_acl.test.ps1`：创建 API EXE/XML 临时 fixture，真实传入 `-DeploymentRoot` 与 `-TargetService PublicOpinionApi`，在同一 Windows PowerShell 进程连续校验两次。

## 覆盖与结果

| 项目 | 结果 |
| --- | --- |
| Windows PowerShell 5.1 执行 v169 ACL fixture | PASS |
| 同一进程连续两次带 DeploymentRoot 校验 | PASS |
| 未授权 `BUILTIN\Users` Allow ACE | 正确拒绝 |
| fixture EXE/XML hash | 校验前后不变 |
| fixture EXE/XML mtime | 校验前后不变 |
| fixture EXE/XML ACL | 负向用例后恢复且与基线一致 |
| fixture / 渲染探针 | 残留数均为 0 |
| Windows PowerShell 5.1 执行既有 v164 | PASS |
| pwsh 7.6.5 执行既有 v164 | PASS |
| Windows PowerShell 5.1 独立 validate | PASS |
| pwsh 7.6.5 独立 validate | PASS |
| install/uninstall/status/rollback dry-run | 全部退出码 0 |
| `git diff --check` | PASS |

## 开发过程中的失败记录

v169 首次运行时，未授权 ACE 已被正确拒绝，但测试夹具使用原 ACL 对象回写后 SDDL 顺序与基线不一致，触发：

- ErrorRecord：`Negative test did not restore ACL: ...\PublicOpinionApi.xml`
- Category：`OperationStopped`
- FullyQualifiedErrorId：`Negative test did not restore ACL: ...\PublicOpinionApi.xml`
- Windows PowerShell：`5.1.19041.3803`
- `PSModulePath`：`C:\Users\Administrator\Documents\WindowsPowerShell\Modules;C:\Program Files\WindowsPowerShell\Modules;C:\Windows\system32\WindowsPowerShell\v1.0\Modules`
- `Microsoft.PowerShell.Security`：`3.0.0.0`，`C:\Windows\system32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1`
- `Microsoft.PowerShell.Utility`：`3.1.0.0`，`C:\Windows\system32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1`

该问题属于测试 fixture 回滚实现，不是校验器漏拒绝。fixture 随 `finally` 清理；随后改为按基线 Access SDDL 精确恢复并重跑，最终全部 PASS。
