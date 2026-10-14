# v022 TapTap Stage C ACL 双运行时兼容修复

## 范围

- 仅调整 `scripts/windows-services/prepare-worker-preflight.ps1` 的 ACL 写入兼容层，以及 `scripts/windows-services/validate-artifacts.ps1` 的 ACL 读取兼容层。
- 测试同步更新 `.tests/2026-09/2026-09-20/v244_taptap_stage_c_acl_compatibility.test.ps1`。
- 未创建、删除、复用或继续运行任何真实 Candidate；尤其未触碰 `worker-release-taptap-20260920-aclfix5e2c`。
- 未执行 B/D、服务控制、重启、补跑或 ProgramData 写入。

## 变更

按 API 能力而非 PowerShell 版本选择 ACL 接口：

- 若 `FileSystemInfo` 暴露实例 `GetAccessControl` / `SetAccessControl`，使用实例 API（Windows PowerShell 5.1）。
- 否则使用 `System.IO.FileSystemAclExtensions` 静态 API（pwsh 7.6.5）。

既有 ACL 规则不变：SID 白名单、Allow 减 Deny 的有效权限计算、未知 Deny 拒绝，以及 reparse point 拒绝均保持。

## 验证

| 验证 | Windows PowerShell 5.1 | pwsh 7.6.5 |
|---|---:|---:|
| v244 ACL 正向、弱权限拒绝、继承/拆分/拒绝 ACE | PASS | PASS |
| v169 validator ACL 回归与无残留 | PASS | PASS |
| 两个脚本 Parser | PASS | PASS |

另以真实 Stage C 所用 `powershell.exe`、`prepare-taptap-worker-candidate.ps1 -Mode DryRun -Isolation` 入口执行 v240 合同回归：PASS；成功 dry-run 与 hash 故障留证路径均通过，且隔离目录清理完成。

`git diff --check` 通过；本项创建的 ACL 与 Stage C fixture 残留为 0。

## 后续门禁

本记录只证明隔离兼容与测试通过。第六个 CandidateId 的真实 C+B 仍须由项目经理重新取得用户授权；在此之前不得操作真实候选目录、ProgramData、服务或采集任务。
