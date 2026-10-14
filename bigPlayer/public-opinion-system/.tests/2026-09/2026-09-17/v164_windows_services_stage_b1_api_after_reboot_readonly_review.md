# v164 Windows 常驻服务阶段 B1：重启后 API-only 失败只读复核

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 安装结论：**FAIL / BLOCKED**
- 回滚结论：**PASS**
- 验收边界：只读核验；未执行安装、验证脚本、服务控制、进程操作、任务/数据库/.env/ACL 修改。

## 失败证据

- 失败报告记录 `install-services.cmd /apply PublicOpinionApi` 在 `validate-artifacts.ps1:7` 的 `Import-Module Microsoft.PowerShell.Security` 失败，错误是 `ObjectSecurity` 扩展 TypeData 重复。
- 该失败发生在 WinSW `install` 之前；因此没有进入 SCM 创建、服务启动、恢复或 API QA。
- 保留的包装器日志只含先前 `13:43` 的“系统正在关机”CreateService 失败，以及 `14:26` 的“指定的服务未安装”状态/卸载尝试；没有新的服务创建成功记录。

## 回滚与运行态核验

| 检查项 | 实时只读结果 | 判定 |
| --- | --- | --- |
| 系统启动 | `2026-09-17 14:17:20 +08:00`，确认已是重启后的会话 | 记录 |
| PublicOpinionApi SCM | `1060`，未安装 | PASS |
| PublicOpinionWorker SCM | `1060`，未安装 | PASS |
| 服务目录 | `C:\ProgramData\PublicOpinion\services` 存在、文件数 `0` | PASS |
| DB | 3306 监听；Repository 只读健康查询成功 | PASS |
| API/前端 | 4320、3001 均无监听，符合报告“未恢复”状态 | 记录 |
| 旧任务 | Keep Server Alive=`Disabled`、Last Night Overseas=`Ready`、Q1 Daily=`Ready`；本次未修改 | PASS（只读快照） |
| Worker | 未安装、未启动 | PASS（符合 API-only 边界） |

## 结论

安全回滚完整，但 API-only 安装被 PowerShell TypeData 冲突阻断，未达到 API QA 门槛；不得进入 Worker 安装或后续恢复/租约/catchup 验收。待开发修复并交付可独立验证的安装前流程后，重新从 API-only 安装开始验收。
