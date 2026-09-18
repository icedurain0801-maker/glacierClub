# v184 ProgramData API 运行包 G1–G4：独立验收报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 结论：**FAIL / 不得开放 API-only 真实安装**。
- 安全边界：未执行 `/apply`，未安装或控制服务，未改 Worker、旧任务、生产 ProgramData、数据库、`.env`、ACL 或发布状态。

## 已通过证据

| 检查项 | 结果 | 证据 |
|---|---|---|
| v182 运行包信任边界 | PASS | 干净 `npm ci --omit=dev`、allowlist、manifest、缺入口、错误 hash、source/release reparse、路径泄漏、服务配置缺失/文件缺失/reparse、生产状态快照与 fixture 清理均通过。 |
| API-only preflight | PASS | 使用锁定 WinSW SHA-256 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`；临时 release、XML entry/cwd、ACL 与 validator 均通过，生产状态快照未变化。 |
| G1/G2/G3 静态契约 | PASS | apply 使用 `releases\release-<随机ID>`；失败清理仅删除新 release；prepare 对 release/services/config 配置为只读、logs/data 为可写；preflight 自建临时 release 并传给 render/validate。 |
| v164 / 独立 validator | PASS | Windows PowerShell 5.1 已通过 v164 和独立 validate；未继续执行到 pwsh 阶段，因下列阻断。 |
| 四项 dry-run | PASS | install / uninstall / status / rollback 均 exit 0。 |

## 阻断缺陷

`v169_validate_artifacts_deployment_acl.test.ps1` 在 Windows PowerShell 5.1 失败，错误为：

```text
Deployment validation requires ReleaseRoot
```

G1–G4 变更使 `validate-artifacts.ps1 -DeploymentRoot` 新增 `ReleaseRoot`（以及运行包相关）必填契约，但既有 v169 DeploymentRoot ACL 回归 fixture 未同步传入/构建此依赖。该回归 exit 1，故测试链路不完整，不能作为真实安装放行依据。

## 现场保护复核

- API、Worker：均 SCM 1060 / 不存在。
- `C:\ProgramData\PublicOpinion\services`：0 文件。
- 四项 dry-run 均为零副作用退出。

## 退回事项

开发负责人需同步修复 v169（以及受同一参数契约影响的既有 fixture），使 DeploymentRoot ACL 回归在新的 versioned release/config/data 验证模型下通过；随后重新执行完整 Windows PowerShell 5.1 / pwsh 回归，再由测试负责人复验。修复前禁止 `/apply`。
