# Windows 常驻服务阶段 A 工件

这些工件只用于评审和后续受控安装，不代表本机已经安装服务。脚本默认 `dry-run`，不会写系统服务、环境变量或任务计划；阶段 B 获得项目经理高影响门禁后，才允许显式传入 `/apply`。

## 服务

- `PublicOpinionApi.xml`：WinSW 配置，入口 `server/src/app.js`。
- `PublicOpinionWorker.xml`：WinSW 配置，入口 `worker/src/worker.js`，`WORKER_MODE=enabled`、`WORKER_INTERVAL_MS=60000`。
- XML 中的 `APP_ROOT`、`NODE_EXE`、`SERVICE_ACCOUNT` 为部署时替换项，不填入密钥或连接串。

## 操作脚本

- `install-services.cmd`：默认 dry-run；`/preflight PublicOpinionApi` 与 `/preflight PublicOpinionWorker` 分别执行隔离预检。当前 `/apply` 只允许 `PublicOpinionApi`，Worker 安装保持关闭。
- `build-worker-release.ps1` / `verify-worker-release.js`：构建并验证 Worker 独立版本化运行包、生产依赖闭包和 SHA-256 manifest。
- `prepare-worker-preflight.ps1` / `worker-readiness.js`：在仓库 `.temp` 验证 Worker XML、ACL、Node/Python 入口，并以只允许 `SELECT`/`SHOW` 的连接检查 schema、lease、epoch 就绪状态。
- `uninstall-services.cmd`：停止并卸载两个新服务；默认 dry-run，必须 `/apply`。
- `status-services.cmd`：通过同名包装器查询两个服务；默认 dry-run，必须 `/query` 才执行只读查询。
- `export-legacy-tasks.cmd`：只读导出旧任务 XML 到指定目录；默认 dry-run。
- `disable-legacy-tasks.cmd`：显示待禁用任务；必须 `/apply` 才执行，绝不删除任务。
- `rollback-services.cmd`：停止/卸载新服务并按导出 XML 恢复旧任务；必须 `/apply` 才执行。

Worker 阶段 B1 仍禁止执行安装、禁用旧任务、写机器环境变量或启动/重启 Worker。

安装脚本遵循 WinSW v2 同名发现规则：同一份已校验二进制分别部署为 `PublicOpinionApi.exe` 和 `PublicOpinionWorker.exe`，配置分别放在同目录的 `PublicOpinionApi.xml` 和 `PublicOpinionWorker.xml`；安装、卸载和状态命令不再传入 XML 路径。安装前脚本将模板转换为绝对入口、工作目录和独立日志目录；`NODE_EXE` 仅用于生成配置，不依赖机器环境变量。Worker 同时显式配置 `UNIFIED_SOURCE_SCHEDULER_MODE=enabled`。服务使用 `NT AUTHORITY\LocalService`；阶段 B 必须先验证该账户对应用、`.env` 的读取权限和独立日志目录的写入权限，不可为了运行而授予管理员权限。WinSW 应固定为 2.x 稳定版本并核验校验和，停止给予 60 秒收尾时间，超时后才允许包装器终止子进程。

静态与默认零副作用验证：`powershell -NoProfile -File scripts/windows-services/validate-artifacts.ps1`。对已准备但尚未安装的部署目录，可追加 `-DeploymentRoot C:\ProgramData\PublicOpinion\services`，只读验证四个同名工件、两个 EXE 的 SHA-256 一致性和 ACL 白名单。验证脚本不安装服务；Windows 控制事件的优雅停止和失败恢复仍需阶段 B 实测，不以静态测试替代。

## 3001 前端代理独立常驻方案

`PublicOpinionFrontend3001` 与 API/Worker 完全解耦，只负责发布版后台静态资源、`/api/*` 与 `/health` 到 `127.0.0.1:4320` 的反向代理，以及 `/healthz/frontend` 自身存活检查。它使用独立根目录 `C:\ProgramData\PublicOpinion\frontend3001`：

```text
frontend3001/
├── releases/<immutable-release>/   # server、静态资源、SHA-256 manifest；LocalService RX
├── config/frontend3001.json        # 固定 [::]:3001 -> 127.0.0.1:4320；LocalService RX
├── services/                       # 同名 WinSW exe/xml；LocalService RX
└── logs/                           # 仅此目录授予 LocalService Modify
```

WinSW 模板配置自动延迟启动和 `5s/30s/60s` 失败恢复，并以 `NT AUTHORITY\LocalService` 运行。release 只复制 `admin/PublicOpinion`、共享侧栏与 `riskModes.js` 所需静态闭包，不复制 `.env`、`node_modules`、测试或仓库其他业务代码；manifest 不匹配、reparse point、配置偏离固定端口/上游、WinSW 哈希不匹配和 ACL 越权都会关闭失败。

门禁命令：

```powershell
# 默认零写入，只显示计划
powershell -NoProfile -File scripts/windows-services/manage-frontend3001.ps1

# 在仓库根 .temp 隔离构建、渲染、施加 ACL、验证并清理；不接触 SCM/生产 ProgramData
powershell -NoProfile -File scripts/windows-services/manage-frontend3001.ps1 -Mode Preflight `
  -WinSWSource C:\path\to\verified\WinSW-x64.exe

# 高影响操作：未来单独审批后才可执行；会安装并启动独立 3001 服务
powershell -NoProfile -File scripts/windows-services/manage-frontend3001.ps1 -Mode Apply `
  -WinSWSource C:\path\to\verified\WinSW-x64.exe `
  -ConfirmApply INSTALL-AND-START-PUBLIC-OPINION-FRONTEND-3001
```

`Apply` 只接受固定 ProgramData 根目录，要求管理员终端、3001 尚未监听且同名服务尚未安装。它不提供隐式升级或切换：任一条件不满足即拒绝；安装/启动失败只回滚 `PublicOpinionFrontend3001` 自己的 wrapper、XML 和本次 release，不操作 `PublicOpinionApi`、`PublicOpinionWorker` 或旧计划任务。本轮未执行 `Apply`。
