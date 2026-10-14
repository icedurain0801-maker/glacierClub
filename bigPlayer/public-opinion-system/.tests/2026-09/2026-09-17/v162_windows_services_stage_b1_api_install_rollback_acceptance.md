# v162 Windows 常驻服务阶段 B1：重启前回滚检查点

- 检查时间：2026-09-17 14:13:12 +08:00
- 结论：**重启前检查点已记录；等待上级建立后续运行机制并下达最终重启命令**
- 边界：本检查只读系统状态并写本报告；未执行重启、服务安装、Worker 操作、旧任务变更、发布或数据操作；未读取或回显 `.env`、Token、密钥、连接串或证书内容。

## 回滚状态

| 检查项 | 结果 |
| --- | --- |
| `PublicOpinionApi` SCM | `sc query` 退出码 `1060`，未安装 |
| `PublicOpinionWorker` SCM | `sc query` 退出码 `1060`，未安装 |
| `C:\ProgramData\PublicOpinion\services` | 目录存在，文件数 `0` |
| WinSW/API/Worker 包装器进程 | `0` 个 |
| 未完成写操作或本会话 shell | 无；本会话所有命令均已返回，无活动命令会话或后台写操作 |

## 端口与健康状态

| 端口 | 监听 | 进程 | PID |
| --- | --- | --- | --- |
| 3306 | `::`，唯一监听 | `mysqld` | `6680` |
| 4320 | `::`，唯一监听 | `node` | `4580` |
| 3001 | `::`，唯一监听 | `node` | `29140` |

`http://127.0.0.1:4320/health` 返回 HTTP `200`，`data.database.status=ok`。

## 旧计划任务状态

| 任务 | 状态 | Enabled |
| --- | --- | --- |
| `BigPlayer Last Night Overseas Daily 02` | `Ready` | `true` |
| `BigPlayer Q1 Daily 02` | `Ready` | `true` |
| `BigPlayer Keep Server Alive` | `Disabled` | `false` |

本检查未修改上述任务。

## 重启挂起信号

注册表 `HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager` 中 `PendingFileRenameOperations`：**存在**。仅记录存在性，未读取或回显其内容。

该信号与前次 WinSW `CreateService` 返回“系统正在关机”一致，支持通过已获用户授权的受控重启清除系统挂起状态。重启应由上级建立可恢复后续运行机制并下达最终命令后执行。
