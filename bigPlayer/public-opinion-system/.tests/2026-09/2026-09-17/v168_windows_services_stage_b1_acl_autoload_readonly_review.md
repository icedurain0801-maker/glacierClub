# v168 阶段 B1 API-only ACL 自动加载失败：只读复核

- 复核日期：2026-09-17
- 复核角色：测试负责人
- 范围：只读核对 `v167` 失败报告、暂存失败工件、SCM 服务状态、部署目录、端口和 API 健康检查。
- 禁止项执行情况：未执行安装、卸载、服务控制、`/apply`、Worker 操作、旧任务修改、进程操作、数据库/`.env`/ACL 修改或发版。

## 复核结果

| 检查项 | 结果 | 只读证据 |
|---|---|---|
| 失败原因 | CONFIRMED | `v167` 记录：`validate-artifacts.ps1 -DeploymentRoot` 进入 `Assert-AllowedAcl` 后，`Get-Acl` 所属 `Microsoft.PowerShell.Security` 未能自动加载，退出码 1；发生在 WinSW install 前。 |
| API 服务 | PASS（未残留） | `PublicOpinionApi` 为 SCM 1060 / 不存在。 |
| Worker 服务 | PASS（未误安装） | `PublicOpinionWorker` 为 SCM 1060 / 不存在。 |
| 实际服务部署目录 | PASS（已回滚） | `C:\ProgramData\PublicOpinion\services` 文件数为 0。 |
| 失败工件保全 | PASS | `.temp/windows-services-stage-b1/failed-deploy-7/` 保留 `PublicOpinionApi.exe`、`PublicOpinionApi.xml`、`PublicOpinionApi.wrapper.log`，仅作为失败证据，不是实际部署目录。 |
| WinSW 执行轨迹 | CONFIRMED | 保全日志显示此前的 install 尝试及后续“服务未安装”的 status/uninstall 记录；与 v167 的“ACL 校验失败在本轮 WinSW install 前”结论不冲突，日志包含的是保全目录内历史记录。 |
| 基础运行态 | PASS | 3306、4320、3001 均处于监听；`http://127.0.0.1:4320/health` 为 HTTP 200，数据库状态为 `ok`。 |

## 结论

FAIL 保持成立，且回滚状态复核通过。阶段 B1 不得重试真实安装；后续应由开发负责人补齐带 `DeploymentRoot` 的 `Get-Acl` 实际调用回归后，再重新进入安装门禁。
