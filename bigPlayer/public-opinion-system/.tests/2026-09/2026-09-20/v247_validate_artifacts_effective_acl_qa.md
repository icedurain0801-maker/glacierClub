# v247 validate-artifacts ACL 有效权限匹配独立 QA

- 测试日期：2026-09-20（北京时间）
- 测试环境：`pwsh 7.6.5`
- 边界：失败候选只读；未修改失败候选、ProgramData 或服务；未执行 B/D、重启、补跑

## 逐项结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 显式/继承 ACE | PASS | `GetAccessRules(true,true,SID)` 同时读取显式和继承规则 |
| Allow 合并 / Deny 扣除 | PASS | v244 拆分 FullControl、继承 ACE、当前账户写 Deny 夹具通过 |
| 未知 Deny | PASS | 未知 SID 的拒绝 ACE 不被任意 SYSTEM Allow 绕过 |
| SYSTEM TakeOwnership Deny | PASS | 拒绝语义保持，未放宽白名单 |
| reparse 拒绝 | PASS | reparse 路径仍 fail-closed |
| 原回归 v169 | PASS | 实际 validator 路径、393 文件验签、ACL/WinSW/无残留均通过 |
| Stage C v240 | PASS | dry-run `DRY_RUN_PASS`；hash 故障 `STAGE_C_REJECTED` 并保留证据 |
| parser/diff | PASS | PowerShell parser 无错误；diff check 无失败，仅 LF/CRLF 提示 |
| 夹具残留 | PASS | v244 报告夹具清理完成，无本次残留 |

## 结论

validator ACL 有效权限读取/匹配修复 **PASS**。满足申请全新 CandidateId 的 QA 前置条件；真实 C+B 仍需项目经理新的弹窗授权，本轮未执行任何真实发布或服务动作。
