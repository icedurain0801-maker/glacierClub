# v013 Windows API 单服务安装门禁修正

## 状态

代码修正与最小验证完成；真实 API 服务安装被 SCM “系统正在关机”阻塞并已回滚，未注册任何新服务。

## 变更

- `scripts/windows-services/render-config.ps1`
  - 将 executable、arguments、workingdirectory、logpath 的 XmlNode 赋值显式转换为字符串。
  - 增加 `ServiceName` 选择，允许仅渲染 API 工件。
- `scripts/windows-services/install-services.cmd`
  - `/apply` 必须显式指定 `PublicOpinionApi`、`PublicOpinionWorker` 或 `All`，避免单服务阶段误装 Worker。
  - 增加 `POWERSHELL_EXE` 可控入口，避免宿主 PowerShell 模块路径污染。
- `scripts/windows-services/validate-artifacts.ps1`
  - 增加 `TargetService`，支持 API-only 部署根验证。
  - 修复 PowerShell 参数与循环变量大小写不敏感导致目标被覆盖的问题。
  - 新增真实隔离渲染及绝对路径、账户、环境节点、占位符和敏感节点断言，探针在 `finally` 中自动清理。

## 验证

- 静态/隔离验证退出码 `0`。
- API-only 同名 EXE/XML、ACL 白名单验证退出码 `0`。
- 四个管理脚本 `/dry-run` 均退出 `0`。
- `git diff --check` 退出码 `0`。

## 运行态影响

- 安全 ACL 已按授权落地；未读取或回显 `.env` 内容。
- `PublicOpinionApi`、`PublicOpinionWorker` 均未安装，SCM 查询返回 `1060`。
- 原 API PID `4580` 保持监听 4320，健康检查 HTTP 200、DB `ok`。
- 3001 和三条旧计划任务状态未改变。
- 失败证据保存在 `.temp/windows-services-stage-b1/failed-deploy-5/` 及 `C:\ProgramData\PublicOpinion\logs\PublicOpinionApi\PublicOpinionApi.wrapper.log`。
