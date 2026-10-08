# TapTap Stage C ACL 读取兼容修复

日期：2026-09-20

## 变更

`scripts/windows-services/validate-artifacts.ps1` 的 ACL 读取改为
`System.IO.FileSystemAclExtensions.GetAccessControl` 的目录、文件静态重载。
该重载在 pwsh 7.6.5 可用，且仍仅读取 `Access` 区段。

未改变 ACL 策略：只允许 SYSTEM、Administrators、当前运行账户和
LocalService 的 Allow ACE；reparse point、未知 Allow ACE、权限不足仍拒绝。

## 验证

`v244_taptap_stage_c_acl_compatibility.test.ps1` 同时断言写入、读取侧均使用
跨 PowerShell 静态重载，并在临时隔离目录实测严格 ACL 与未授权 ACE 拒绝。
`v169_validate_artifacts_deployment_acl.test.ps1` 覆盖 validator 的实际部署 ACL
读取路径及无残留夹具清理。

## 边界

未访问或变更 `worker-release-taptap-20260920-acl4d9b7` 的候选、release、staging、
audit 或 `failure.json`。未写 ProgramData，未执行 B/D、服务控制、重启或补跑。
