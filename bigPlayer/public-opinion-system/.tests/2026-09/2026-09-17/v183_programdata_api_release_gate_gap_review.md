# v183 ProgramData API 运行包：门禁缺口复核

- 复核日期：2026-09-17
- 复核角色：测试负责人
- 范围：只读静态复核运行包与 preflight 的生产同构、版本切换、ACL、fixture 覆盖边界。
- 决定：**FAIL / 不得开放 `/apply`**。

## 已通过的隔离项目

- `v182_api_release_runtime.test.ps1`：干净 `npm ci --omit=dev`、严格 allowlist、依赖闭包、manifest 复算与篡改拒绝通过；测试前后受保护生产快照未变。
- `runtimeEnv.test.js`：服务模式缺失配置、目录/reparse 配置路径拒绝通过。
- v164/v169/v173、独立 validator（Windows PowerShell 5.1 / pwsh 已覆盖要求组合）和四项 dry-run 通过。

## 门禁级缺口

| 编号 | 独立复核证据 | 风险 |
|---|---|---|
| G1 | `install-services.cmd` 的 apply 固定 `RUNTIME_ROOT=%ProgramData%\PublicOpinion\app\current`；不存在 `releases\<release-id>`、原子切换或版本回滚语义。 | 无法证明可追溯发布或安全回退。 |
| G2 | `prepare-services.ps1` 仅在 `Preflight` 分支定义并调用 `Set-StrictPreflightAcl`，Apply 分支没有建立/核验 app、services、config、logs、data 的完整最小 ACL；失败清理也没有证明 config/data 保留策略。 | 生产运行目录的权限边界和清理边界无门禁。 |
| G3 | Preflight 设置临时 `releaseValidationRoot`，但调用 `render-config.ps1` 时仍传入外部 `RuntimeRoot`；即预检 XML entry/cwd 可指向生产 `app\current`，并非刚构建的临时 release。 | Preflight 与 Apply 不同构，未验证真实运行包入口与工作目录。 |
| G4 | v182 仅验证正常构建、allowlist、manifest 篡改；未实现/断言缺失配置、release reparse、路径泄漏、真实构建包 entry/cwd、config/data fixture 或完整生产状态快照。 | 报告声称的覆盖范围超出实际测试。 |

## 结论与退回事项

运行包的基础构建测试通过，但不足以通过生产服务化门禁。请开发负责人补齐 G1–G4 的设计与可执行隔离测试，并由项目经理重新评审；在此之前禁止真实 `/apply`、服务安装或生产 ProgramData/ACL 修改。
