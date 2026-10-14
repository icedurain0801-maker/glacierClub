# v193 3001 可靠常驻运维脚本方案

- 日期：2026-09-17
- 范围：仅 `scripts/windows-services/` 的 3001 专属工件、对应零副作用测试与本文档。
- 边界：未修改 server/worker/frontend 业务代码；未执行 Apply、安装、启动、停止、部署或现网切换；未操作 PublicOpinionApi/PublicOpinionWorker。

## 变更

1. 新增独立 WinSW 服务 `PublicOpinionFrontend3001`，使用 LocalService、Automatic delayed start、三段失败重启和 30 秒优雅停止。
2. 新增不可变 release 构建与 SHA-256 manifest 校验，只打包后台静态资源闭包和专用 3001 静态/反代运行时。
3. 使用 `C:\ProgramData\PublicOpinion\frontend3001` 独立的 `releases/config/services/logs`；LocalService 对前三类仅 RX，对 logs 为 Modify。
4. 新增 `DryRun/Preflight/Apply` 门禁。Apply 需固定确认令牌、管理员终端、空闲 3001 和未安装同名服务；拒绝隐式升级或并行切换。
5. Apply 的失败回滚只允许触及本次创建的 `PublicOpinionFrontend3001` wrapper/XML/release；预存同名工件绝不删除，SCM 卸载未完成时保留恢复工件并关闭失败。禁止控制 API、Worker 和旧计划任务。

## 验证

- `DryRun`：只打印计划，受保护状态不变。
- `Preflight`：在仓库根 `.temp` 完成 release、XML、ACL、配置和 WinSW 哈希校验后自动清理，不访问生产 ProgramData 或 SCM。
- 负例：缺少 Apply 确认令牌、错误 WinSW 哈希、release 篡改均关闭失败。
- 快照：3001/4320 监听、三个 SCM 服务、旧计划任务和生产 frontend3001 ProgramData 前后保持一致。

## 剩余风险

- 本轮未获授权执行 Apply，因此 Windows SCM 自动启动、真实重启恢复、LocalService 实际读取静态资源、3001 端口占用冲突、Kong/LAN/localhost 全链路仍需后续高影响窗口验收。
- 当前方案故意不支持原地升级；后续版本切换需要单独设计可审计的蓝绿或停机切换/回滚流程。
