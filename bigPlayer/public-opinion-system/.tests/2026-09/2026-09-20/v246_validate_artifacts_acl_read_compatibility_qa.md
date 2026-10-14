# v246 validate-artifacts ACL 读取兼容独立 QA

- 测试日期：2026-09-20（北京时间）
- 测试环境：`pwsh 7.6.5`
- 边界：未触碰失败 CandidateId `worker-release-taptap-20260920-acl4d9b7`、ProgramData、服务、B/D、重启或补跑；仅检查本次临时夹具无残留

## 逐项结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| v244 ACL 读写正例 | PASS | `FileSystemAclExtensions` 静态重载对 DirectoryInfo/FileInfo 可读写严格 Worker ACL |
| v244 ACL 拒绝例 | PASS | 弱/未授权 ACE 与 reparse 拒绝语义保持 |
| ACL 权限白名单 | PASS | SYSTEM/Admin FullControl、当前账户 RX、LocalService 读或 Modify 保持 |
| v169 实际 validator 路径 | PASS | API release 393 files 验签、部署布局/ACL、WinSW 模板、未授权 ACE 拒绝和无残留均通过 |
| v240 Stage C C 合同 | PASS | `DRY_RUN_PASS`；注入 hash failure 为 `STAGE_C_REJECTED`，失败证据留存 |
| PowerShell parser | PASS | `validate-artifacts.ps1` 与 `prepare-worker-preflight.ps1` 无 parser 错误 |
| diff check | PASS | 无检查失败，仅 LF/CRLF 提示 |

## 结论

`validate-artifacts.ps1` ACL 读取兼容修复 **PASS**。本次 QA 未触碰旧失败 CandidateId、ProgramData 或服务；真实 C+B 仍需全新 CandidateId 和新的弹窗授权。
