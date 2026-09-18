# v185 v169 ReleaseRoot 契约：独立复验报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：仅 v169 fixture 的新版 ReleaseRoot/config/data/log 契约复验及残留检查。

## 功能回归结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| Windows PowerShell 5.1 | PASS | v169 exit 0；构建临时 `releases\release-test`，连续两次 validator 通过。 |
| pwsh | PASS | v169 exit 0；同一 fixture 契约通过。 |
| ReleaseRoot/config/data/log fixture | PASS | fixture 构建 versioned release；release/services/config 为 LocalService ReadAndExecute，logs/data 为 Modify。 |
| 重入与无改写 | PASS | 两次 validator 后 EXE/XML hash、mtime、ACL 不变。 |
| 未授权 Allow ACE | PASS | 在 XML fixture 注入 Builtin Users Allow Read 后被 validator 拒绝，ACL 恢复后再次校验基线一致。 |
| 残留 | PASS | `.temp/v169-*` 与 `.temp/winsw-render-validation-*` 均为 0。 |

## 变更范围可证明性

**NOT PROVABLE（不作为功能失败）**：仓库根工作区存在大量既有已修改和未跟踪文件，且 `.tests/2026-09/2026-09-17/` 与 `scripts/windows-services/` 均为未跟踪目录；因此 Git 无法从当前基线证明“本次仅 v169 测试文件变更”。本次未修改任何业务或脚本文件。

## 结论

**功能 PASS，变更范围证明缺失。** v169 的 ReleaseRoot/config/data/log fixture 修复已通过 Windows PowerShell 5.1 与 pwsh 独立复验，解除 v184 中 v169 的功能阻断。若项目经理将“仅该测试文件变更”作为放行硬条件，需由开发负责人提供可比较基线（例如提交、独立补丁或变更清单）后再确认。
