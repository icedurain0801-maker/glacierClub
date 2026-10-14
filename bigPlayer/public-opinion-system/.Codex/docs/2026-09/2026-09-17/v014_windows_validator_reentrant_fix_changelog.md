# v014 Windows 服务校验器重复导入修复

## 变更

- `scripts/windows-services/validate-artifacts.ps1`
  - 移除不必要的 `Microsoft.PowerShell.Security` 显式导入，避免 Windows PowerShell 重启后宿主出现 `ObjectSecurity` 重复 TypeData 错误。
  - 结尾由 `exit 0` 改为 `return`，支持在同一 PowerShell 会话重复调用，同时保留 `-File` 成功退出语义。
- `.tests/2026-09/2026-09-17/v164_validate_artifacts_reentrant.test.ps1`
  - 新增同一 `powershell.exe -NoProfile` 会话连续执行两次的回归，并校验隔离渲染探针无残留。

## 验证

- 重入回归：PASS，退出码 0。
- 独立校验：PASS，退出码 0。
- install/uninstall/status/rollback 四个 `/dry-run`：全部退出码 0。
- 隔离渲染探针残留：0。
- 未执行 `/apply`，未安装任何服务。
