# v161 Windows 常驻服务阶段 B1：API 单服务安装尝试

- 执行日期：2026-09-17
- 执行时段：13:43:06–13:44:14（Asia/Shanghai）
- 结论：**BLOCKED / 已回滚**
- 边界：只允许 `PublicOpinionApi` 安装、启动与恢复验证；未安装 Worker，未停用或删除旧任务，未 push、合并、tag、发版或删除数据。

## 安装前快照

| 项目 | 状态 |
| --- | --- |
| MySQL 3306 | `::3306`，PID `6680`，`mysqld.exe` |
| API 4320 | `::4320`，PID `4580`，`node.exe` |
| 前端代理 3001 | `::3001`，PID `29140`，`node.exe` |
| `PublicOpinionApi` SCM | `NOT_INSTALLED` |
| `PublicOpinionWorker` SCM | `NOT_INSTALLED` |
| `C:\ProgramData\PublicOpinion\services` | 存在，文件数 `0` |
| `BigPlayer Last Night Overseas Daily 02` | `Ready`、Enabled |
| `BigPlayer Q1 Daily 02` | `Ready`、Enabled |
| `BigPlayer Keep Server Alive` | `Disabled`、Disabled |

本次探测中，localhost、LAN、外网的 `sources.html`、`public-opinion.css` 均为 HTTP 200；三层 `/api/public-opinion/sources` 均返回 `data`/`meta` 真实结构且 `dataCount=6`。`http://127.0.0.1:4320/health` 为 HTTP 200，`data.database.status=ok`。外网 DNS A 记录为 `172.16.0.192`；当前链路健康，未出现新的 Kong 错误页，既有已确认 upstream 仍按 `172.16.2.48:3001` 记录。

## 安全配置

全程未读取或回显 `.env` 内容，仅核对元数据并收紧 ACL：

- 项目代码增加 `LocalService` 继承 RX。
- `.env` 关闭继承，仅保留 SYSTEM/Administrators FullControl、当前运维账户/LocalService Read。
- 服务目录仅保留 SYSTEM/Administrators FullControl、当前运维账户/LocalService RX。
- 日志目录仅保留 SYSTEM/Administrators FullControl、当前运维账户 RX、LocalService Modify。

ACL 命令均返回 `0`，随后只读矩阵核验通过。

## 三次安装尝试与回滚

1. 首次尝试在 `render-config.ps1` 失败，错误为 `Cannot set workingdirectory because only strings can be used as values to set XmlNode properties.`；发生在 SCM 注册前。生成工件已移至 `.temp/windows-services-stage-b1/failed-deploy-2/`。
2. 修复字符串赋值后，API-only 验证因 PowerShell 参数 `ServiceName` 与顶层循环变量大小写不敏感碰撞而错误寻找 Worker 工件；命令退出码 `1`，发生在 SCM 注册前。生成工件已移至 `.temp/windows-services-stage-b1/failed-deploy-3/`。
3. 修复目标参数后，静态和隔离 API-only 校验均 PASS。执行 `install-services.cmd /apply PublicOpinionApi` 时，渲染与 ACL 校验 PASS，WinSW 于 `2026-09-17 13:43:38` 写入：`FATAL - Failed to create service. 系统正在关机。`。调用通道在约 30 秒处超时，未取得可靠的脚本最终退出码，因此不虚构退出码；随后 SCM 查询明确返回 `1060`。生成工件已移至 `.temp/windows-services-stage-b1/failed-deploy-5/`。

每次失败后均确认 `PublicOpinionApi` 与 `PublicOpinionWorker` 未注册、4320 原 API 未停止，并将 `C:\ProgramData\PublicOpinion\services` 恢复为空。未继续执行启动、正常重启、强杀或电脑重启。

## 代码修正与最小验证

- `render-config.ps1`：四个动态 XmlNode 值显式转换为 `[string]`；支持只渲染指定服务。
- `install-services.cmd`：`/apply` 强制指定 `PublicOpinionApi`、`PublicOpinionWorker` 或 `All`，本次只调用 `PublicOpinionApi`；支持显式 `POWERSHELL_EXE`。
- `validate-artifacts.ps1`：部署根校验支持单服务目标，避免参数/循环变量碰撞；隔离渲染逐项验证绝对 executable、arguments、workingdirectory、logpath、LocalService、环境节点、无敏感节点及无占位符残留。

验证结果：

- `validate-artifacts.ps1`：退出码 `0`。
- API-only 隔离部署验证：退出码 `0`，探针自动清理。
- 缺少 `/apply` 服务目标：退出码 `2`，零副作用。
- install/uninstall/status/rollback 四个 `/dry-run`：退出码均为 `0`。
- `git diff --check -- scripts/windows-services`：退出码 `0`。

## 回滚后状态

截至 `2026-09-17 13:44:14 +08:00`：

| 项目 | 状态 |
| --- | --- |
| `PublicOpinionApi` SCM | `sc query` 返回 `1060`，未安装 |
| `PublicOpinionWorker` SCM | `sc query` 返回 `1060`，未安装 |
| 服务目录 | 文件数 `0` |
| API 4320 | 原 `node.exe` PID `4580` 唯一监听 |
| API 健康 | HTTP 200，DB `ok` |
| 3001 localhost | HTTP 200 |
| 外网页面 | HTTP 200 |
| 三条旧任务 | 与安装前一致：Ready/Ready/Disabled |

## 阻塞与下一步

SCM 在 CreateService 阶段返回“系统正在关机”。根据失败即停止门禁，本轮未重试、未重启电脑，也未继续故障恢复测试。下一步须由项目经理确认操作系统是否存在待关机/重启状态，并重新授权后再执行 API 单服务安装。
