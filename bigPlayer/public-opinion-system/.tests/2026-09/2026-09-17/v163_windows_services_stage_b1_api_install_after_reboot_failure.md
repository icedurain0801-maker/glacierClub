# v163 Windows 常驻服务阶段 B1：重启后 API-only 安装失败

- 执行日期：2026-09-17
- 结论：**FAIL / 已停止并回滚**
- 边界：本轮只尝试安装 `PublicOpinionApi`；未安装 Worker，未停用或删除旧任务，未 push、合并、tag、发版、删除数据或执行补跑；未读取或回显 `.env`、Token、密钥、连接串或证书内容。

## 重启与安装前状态

| 检查项 | 结果 |
| --- | --- |
| 系统最近启动时间 | `2026-09-17 14:17:20 +08:00`，晚于 v162 的 `14:13:12` 检查点，确认已完成新启动 |
| `PendingFileRenameOperations` | 仍存在，条目数 `2`；未读取或回显条目内容 |
| MySQL 3306 | `::3306` 唯一监听，`mysqld.exe` PID `6064` |
| API 4320 | 未监听 |
| 前端代理 3001 | 未监听 |
| `PublicOpinionApi` SCM | `1060`，未安装 |
| `PublicOpinionWorker` SCM | `1060`，未安装 |
| `C:\ProgramData\PublicOpinion\services` | 空目录 |
| 旧计划任务 | `BigPlayer Last Night Overseas Daily 02=Ready`；`BigPlayer Q1 Daily 02=Ready`；`BigPlayer Keep Server Alive=Disabled` |
| 外网入口 | 请求超时；与 4320/3001 尚未恢复一致 |

## API-only 安装尝试

严格使用以下目标执行，未传入 Worker 或 All：

```text
scripts\windows-services\install-services.cmd /apply PublicOpinionApi
```

WinSW 来源为仓库根 `.temp/windows-services-stage-b1/winsw-v2.12.0/WinSW-x64.exe`，SHA-256 为：

```text
05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA
```

安装在 SCM 注册前失败，退出码 `1`。失败点为 `validate-artifacts.ps1:7` 导入 `Microsoft.PowerShell.Security`，PowerShell 报 `FormatXmlUpdateException`：`System.Security.AccessControl.ObjectSecurity` 的 `AuditToString`、`AccessToString`、`Sddl`、`Access`、`Group`、`Owner`、`Path` 扩展成员已存在。

由于验证阶段失败，WinSW `install` 未执行；随后查询 API 与 Worker 均保持 SCM `1060`。

## 回滚结果

按失败即停门禁执行 `rollback-services.cmd /apply`，退出码 `0`。生成的 API EXE、XML 及包装器日志已保全至：

```text
.temp/windows-services-stage-b1/failed-deploy-6/
```

回滚后：

- `PublicOpinionApi`：SCM `1060`。
- `PublicOpinionWorker`：SCM `1060`。
- `C:\ProgramData\PublicOpinion\services`：文件数 `0`。
- 仅 3306 监听；4320、3001 未监听。
- 三条旧计划任务仍为 `Ready / Ready / Disabled`，未改变。

## 阻塞结论

本轮没有再次出现 SCM“系统正在关机”，但被 Windows PowerShell 安全模块的重复 TypeData 导入错误阻塞，尚未进入服务创建、启动、重启或强杀恢复测试。按门禁不在本单内诊断、修改或重试安装；不得进入 Worker 安装与 QA PASS 流程。
