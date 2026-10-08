# TapTap Stage C ACL 有效权限校验修复

日期：2026-09-20

## 根因与变更

失败候选 `worker-release-taptap-20260920-cb4f0a7e` 的 `failure.json` 记录
`FullControl missing for S-1-5-18`。只读检查表明候选 release 根目录实际拥有
SYSTEM 和 Administrators 的显式 `FullControl` ACE；问题是 pwsh 7.6.5 静态 ACL
读取对象的 `.Access` 集合为空，而 validator 误以该集合计算权限。

`scripts/windows-services/validate-artifacts.ps1` 现使用
`GetAccessRules(includeExplicit=true, includeInherited=true, SecurityIdentifier)`：

- 校验 Allow 和 Deny ACE 的 SID 白名单，不再忽略 Deny ACE；
- 合并同一 SID 的拆分 Allow 权限后，扣除所有 Deny 覆盖的位，按有效权限判定；
- 显式和继承 ACE 均参与计算，SYSTEM/Administrators 仍必须有效 `FullControl`；
- 当前运行账户和 LocalService 的最小权限与禁止写入语义不变。

## 验证

`v244_taptap_stage_c_acl_compatibility.test.ps1` 在 pwsh 7.6.5 的临时夹具覆盖：

- 拆分的显式 `FullControl` Allow ACE；
- 继承的 SYSTEM/Administrators/LocalService ACE；
- 当前账户的写入 Deny 后仍保留只读执行；
- SYSTEM 的 `TakeOwnership` Deny 必须导致验证拒绝。

同时复跑 `v169_validate_artifacts_deployment_acl.test.ps1` 的实际 validator 部署
ACL 路径；两项均通过，脚本 parser 与 `git diff --check` 通过。

## 边界

仅只读检查失败候选 `worker-release-taptap-20260920-cb4f0a7e` 的 ACL 与
`failure.json`；未修改、删除、重用或续跑该候选。
未执行 Stage B/D、服务控制、重启或补跑；本修复完成隔离 QA 前，不请求第五次
真实 C+B。
