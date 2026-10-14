# v015 Windows 服务部署 ACL 校验修复

## 变更

- `scripts/windows-services/validate-artifacts.ps1`
  - ACL 读取由 `Get-Acl` 改为既有 `FileInfo.GetAccessControl(Access)`，绕过故障宿主中的模块自动加载路径。
  - API-only 成功文案仅报告单服务 EXE/XML 与 ACL；`All` 模式才报告双包装器 hash 一致。
- `.tests/2026-09/2026-09-17/v169_validate_artifacts_deployment_acl.test.ps1`
  - 新增真实 `DeploymentRoot` / `PublicOpinionApi` 隔离 fixture。
  - 覆盖同进程双次调用、未授权 Allow ACE 拒绝、hash/mtime/ACL 不变与 fixture/渲染探针清理。

## 验证

- Windows PowerShell 5.1：v169、v164、独立 validate 全部 PASS。
- pwsh 7.6.5：v164、独立 validate 全部 PASS。
- install/uninstall/status/rollback 四个 dry-run 全部退出码 0。
- fixture 与渲染探针残留均为 0；`git diff --check` PASS。
- 未执行任何 `/apply`。
