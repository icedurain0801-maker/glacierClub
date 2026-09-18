# v165 本机舆情链路恢复与 WinSW 校验器回归

- 执行日期：2026-09-17
- 结论：**开发自测 PASS；等待测试负责人浏览器强刷**
- 边界：未执行任何 `/apply`，未安装 API/Worker 服务，未修改旧任务、数据库、`.env` 或 ACL，未 push、合并、tag 或发版。

## 本机链路恢复

| 检查项 | 结果 |
| --- | --- |
| MySQL | `::3306` 监听，`mysqld.exe` PID `6064` |
| API 启动方式 | 复用仓库 `npm run start:server` |
| API | `::4320` 监听，PID `26236`；`/health` HTTP 200，`data.database.status=ok` |
| 前端代理 | 复用已有 `.temp/qa_proxy_3000.js` 的既有静态/反代实现，在内存中仅将监听端口临时改为 3001；未新增长期脚本 |
| 3001 | `::3001` 监听，PID `25008`，满足所有接口监听 |
| Worker | SCM `1060`，未安装、未启动 |
| 旧任务 | `Ready / Ready / Disabled`，未改变 |

三层均使用实际业务页 `/admin/PublicOpinion/sources.html`，未以根路径代替：

| 层级 | 页面 | CSS | JS | 真实 API |
| --- | --- | --- | --- | --- |
| localhost `127.0.0.1:3001` | 200，20471 bytes | 200，7025 bytes | 200，108629 bytes | 200，`dataCount=6`，存在 `meta` |
| LAN `172.16.2.48:3001` | 200，20471 bytes | 200，7025 bytes | 200，108629 bytes | 200，`dataCount=6`，存在 `meta` |
| 外网 `lfy3001.dev.q1op.com` | 200，20471 bytes | 200，7025 bytes | 200，108629 bytes | 200，`dataCount=6`，存在 `meta` |

已将外网浏览器强刷交测试负责人，要求核验非 504、非白屏、资源完整、真实数据渲染、Console 零 error/warn。

## `validate-artifacts.ps1` 最小修复

根因：脚本显式执行 `Import-Module Microsoft.PowerShell.Security` 时，干净重启后的 Windows PowerShell 宿主加载扩展类型数据，触发 `System.Security.AccessControl.ObjectSecurity` 多个成员重复的 `FormatXmlUpdateException`。脚本实际只使用可自动加载的 `Get-Acl`；显式导入没有必要。

修改：

- 删除显式 `Import-Module Microsoft.PowerShell.Security`，不吞掉任何 cmdlet 执行错误。
- 将结尾 `exit 0` 改为 `return`，允许调用方在同一 PowerShell 宿主中连续执行校验脚本。
- 新增 `v164_validate_artifacts_reentrant.test.ps1`，同一 `powershell.exe -NoProfile` 会话连续调用校验器两次，并确认两次隔离渲染探针均清理。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 同一 Windows PowerShell NoProfile 会话连续校验两次 | PASS，退出码 0 |
| 单独 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File validate-artifacts.ps1` | PASS，退出码 0 |
| 隔离 XML 渲染与字段检查 | PASS（由校验器执行） |
| 渲染探针清理 | PASS，残留数 0 |
| install `/dry-run` | 0 |
| uninstall `/dry-run` | 0 |
| status `/dry-run` | 0 |
| rollback `/dry-run` | 0 |
| `git diff --check`（本次代码与测试） | PASS |

本轮严格未再次执行服务安装；API/Worker 均未进入新的 SCM 创建流程。
