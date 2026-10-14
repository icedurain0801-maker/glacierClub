# v245 TapTap Stage C ACL 跨 PowerShell 兼容独立 QA

- 测试日期：2026-09-20（北京时间）
- 测试环境：同版本 `pwsh 7.6.5`
- 边界：不重跑旧 CandidateId；未写 ProgramData，未控制服务，未运行真实 B 预检/切换/补跑

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| ACL 正向用例 | PASS | `FileSystemAclExtensions.SetAccessControl` 静态重载可在 pwsh 7.6.5 应用严格 Worker ACL |
| ACL 拒绝用例 | PASS | 弱/未授权 ACE 被拒绝；reparse 拒绝语义保持 |
| 权限白名单 | PASS | SYSTEM/Admin FullControl、当前账户 RX、LocalService 读或 Modify 保持 |
| v240 Stage C 合同回归 | PASS | dry-run `DRY_RUN_PASS`；注入 hash failure 返回 `STAGE_C_REJECTED`，失败留证通过 |
| PowerShell parser | PASS | `prepare-worker-preflight.ps1` parser 无错误 |
| diff check | PASS | 无检查失败，仅有 LF/CRLF 转换提示 |

## 结论

TapTap Stage C ACL 跨 PowerShell 兼容修复 **PASS（隔离 QA）**。后续新 CandidateId 的真实 C+B 仍需项目经理单独授权；本次未触碰旧 CandidateId、ProgramData 或服务。
