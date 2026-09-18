# v166 外网浏览器与校验脚本回归验收报告

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 验收范围：外网采集源页面只读强刷；`validate-artifacts.ps1` 的 Windows PowerShell 同进程重入修复与四个零副作用 dry-run。
- 写操作：无。未执行 `/apply`，未安装或卸载服务，未修改任务、进程、数据库、`.env`、ACL 或业务代码。

## 1. 外网浏览器验收

### 环境

- 新建干净的 In-app Browser 标签页。
- 页面：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5`

### 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 页面可访问，非 504/非白屏 | PASS | 标题为“抓取账号管理 - 舆情管理后台”，页面主体与导航完整渲染。 |
| 页面加载完成 | PASS | “正在加载采集源...”消失。 |
| 真实采集源数据渲染 | PASS | 显示 1 个账号源：`大玩家H5社区 社区动态`，平台为 BigPlayer社区，授权状态为“已授权”。 |
| 前端资源引用 | PASS | 页面引用 `admin/PublicOpinion/public-opinion.css` 与 `admin/PublicOpinion/assets/sources.js?v=145`。 |
| Console error/warn | PASS | 浏览器采集的 error/warn 日志为空。 |

### 业务数据观察（非本次恢复阻断项）

该账号源仍展示既有数据状态：帖子 `18,396 已写入 / 2 待处理`、评论 `86,713 已写入 / 1,072 待处理`，最近同步提示 `provider_pagination_budget_exhausted`。这表明页面和数据读取链路已恢复，但“抓取完整遍历”问题仍需由开发负责人单独定位；本次未触发任何回溯或同步操作。

## 2. validate-artifacts.ps1 回归验收

### 已执行命令

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .tests\2026-09\2026-09-17\v164_validate_artifacts_reentrant.test.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows-services\validate-artifacts.ps1
scripts\windows-services\install-services.cmd
scripts\windows-services\uninstall-services.cmd
scripts\windows-services\status-services.cmd
scripts\windows-services\rollback-services.cmd
```

### 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 同一 `powershell.exe -NoProfile` 会话连续两次校验 | PASS | `v164_validate_artifacts_reentrant.test.ps1` 输出 PASS，未发生 Security TypeData 冲突。 |
| 单独执行校验脚本 | PASS | 输出 `PASS: WinSW v2 same-name templates and commands valid...`。 |
| 安装 dry-run | PASS | exit 0；输出明确未改变服务、环境变量、任务或进程。 |
| 卸载 dry-run | PASS | exit 0；输出明确未改变服务、文件、任务、环境变量或进程。 |
| 状态查询 dry-run | PASS | exit 0；输出明确未改变服务、文件、任务、环境变量或进程。 |
| 回滚 dry-run | PASS | exit 0；输出明确未改变服务或任务。 |
| 渲染探针清理 | PASS | `.temp/winsw-render-validation-*` 残留数量为 0。 |

## 结论

PASS（验收范围内）。外网采集源页恢复可读且无浏览器控制台告警；Windows PowerShell 重入修复及全部四项 dry-run 均通过。采集源的分页预算耗尽提示作为既有业务缺陷另行跟踪。
