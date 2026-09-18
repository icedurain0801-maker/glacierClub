# v160 WinSW v2 配置渲染：隔离复验

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 结论：**PASS**
- 执行边界：仅在仓库 `.temp/qa-winsw-render-20260917/` 渲染；未执行 `/apply`、未安装服务、未改 ProgramData、环境变量、DB、旧任务或 `.env` ACL。

## 隔离渲染结果

| 项目 | API | Worker |
| --- | --- | --- |
| XML ID | `PublicOpinionApi` | `PublicOpinionWorker` |
| executable | 绝对 `C:\Program Files\nodejs\node.exe` | 同左 |
| arguments | 绝对、带引号的 `server\src\app.js` | 绝对、带引号的 `worker\src\worker.js` |
| workingdirectory | 绝对 `server` 目录 | 绝对 `worker` 目录 |
| logpath | 隔离 logs 下独立 Api 目录 | 隔离 logs 下独立 Worker 目录 |
| serviceaccount | `NT AUTHORITY\LocalService` | `NT AUTHORITY\LocalService` |
| env 节点 | 0 | 恰 3 个：`WORKER_MODE=enabled`、`UNIFIED_SOURCE_SCHEDULER_MODE=enabled`、`WORKER_INTERVAL_MS=60000` |
| 密钥 / 占位符 | 未发现 | 未发现 |

## 回归与副作用检查

- `validate-artifacts.ps1`：PASS。
- install / uninstall / status / rollback 四个 `/dry-run`：均退出 `0`，且明确无副作用。
- `C:\ProgramData\PublicOpinion\services`：存在但文件数 `0`。
- `PublicOpinionApi`、`PublicOpinionWorker`：未注册为 Windows 服务。

## 结论

`render-config.ps1` 的 XmlNode/String 修复已由真实 PowerShell 隔离流程验证，未再出现渲染阻塞；可继续等待后续已授权的真实安装与运行态分段验收。
