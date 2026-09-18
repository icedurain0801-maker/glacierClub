# v196 B 线 PublicOpinionFrontend3001：零副作用 Preflight 验收

- 验收角色：测试负责人
- 结论：**PASS**。
- 范围：隔离 fixture、DryRun、Preflight 与静态核对；未执行 Apply、未安装或切换现网。

## 验收结果

- 独立 release 闭包为 27 文件；只含静态后台、共享侧栏、`riskModes.js` 与前端代理运行时。
- release manifest 校验通过；篡改 `frontend3001-server.js` 后验证被拒绝。
- WinSW 模板使用 `NT AUTHORITY\\LocalService`、延迟自动启动和 `5s/30s/60s` 恢复策略。
- 配置固定 `[::]:3001 -> http://127.0.0.1:4320`；无用户路径或秘密。
- 前端代理仅转发 `/api/*`、`/health` 至 4320，提供独立 `/healthz/frontend`，其余走受限静态路径。
- DryRun 无副作用；Preflight 仅在仓库 `.temp` 建立并清理 fixture；无固定确认口令的 Apply 被拒绝。
- 已有 wrapper 的所有权回滚、SCM 卸载未完成时保留恢复工件、reparse/ACL/哈希拒绝均有脚本门禁覆盖。

## 执行

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .tests\\2026-09\\2026-09-17\\v193_frontend3001_resident_zero_effect.test.ps1
```

结果：通过，包含 27 文件闭包、篡改拒绝、DryRun、Preflight、Apply 口令门禁与受保护状态不变验证。

## 前后状态一致

- `C:\\ProgramData\\PublicOpinion\\frontend3001`：始终不存在。
- 监听：3001 PID 34656、4320 PID 7172、3306 PID 32808，前后一致。
- `PublicOpinionApi`、`PublicOpinionWorker`：始终 `Running/Automatic`。
- 旧任务：两个每日任务 `Ready`，保活任务 `Disabled`，前后一致。
- 4320 `/health` 始终 HTTP 200。

## 未执行项

- 未执行 `manage-frontend3001.ps1 -Mode Apply`。
- 未安装 `PublicOpinionFrontend3001`、未切换 Kong、未改变 3001 监听、未操作 API/Worker/旧任务。
