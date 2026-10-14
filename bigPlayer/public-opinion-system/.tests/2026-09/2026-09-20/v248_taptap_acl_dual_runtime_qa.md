# v248 TapTap ACL 双运行时独立 QA

- 测试日期：2026-09-20（北京时间）
- 运行时：Windows PowerShell 5.1.19041.3803；pwsh 7.6.5
- 边界：未触碰第五失败候选、ProgramData、服务、B/D、重启或补跑

## 逐项结果

| 检查项 | PowerShell 5.1 | pwsh 7.6.5 |
|---|---|---|
| v244 ACL 正反例 | PASS | PASS |
| v169 validator 实际路径 | PASS | PASS |
| v240 C isolation dry-run/hash failure | PASS | PASS |
| PowerShell parser | PASS | PASS |
| diff check | PASS | PASS |
| 夹具清理 | PASS | PASS |

实现按 `PSObject.Methods.Match` 能力分支选择 ACL API：5.1 使用实例 Get/SetAccessControl，7.6.5 使用 `FileSystemAclExtensions` 静态重载；未按版本硬编码。白名单、Allow-Deny、未知 Deny、reparse 拒绝语义保持。

## 结论

TapTap ACL 双运行时兼容与真实 C 同 shell/入口隔离合同 **PASS**。满足申请第六个全新 CandidateId 的 QA 前置条件；真实 C+B 仍需新的弹窗授权，本轮未执行任何真实服务动作。
