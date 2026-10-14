# v187 ProgramData API-only 真实服务独立验收

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：仅 `PublicOpinionApi` 的版本化运行包、Windows 服务恢复能力及三层访问验收。
- 边界：未安装或操作 Worker，未修改旧任务、数据库、`.env`、ACL、发布或数据补跑。

## 服务与权限

| 检查项 | 结果 | 证据 |
|---|---|---|
| SCM | PASS | Running；`StartName=NT AUTHORITY\LocalService`；Automatic Delayed。 |
| 恢复策略 | PASS | `sc qfailure` 显示重启延迟 5 / 30 / 60 秒。 |
| 运行进程身份 | PASS | 4320 Node 子进程为 wrapper 子进程，Owner 为 `NT AUTHORITY\LOCAL SERVICE`。 |
| 运行包路径 | PASS | Node 入口为 `C:\ProgramData\PublicOpinion\releases\release-14869-24421-11130\server\src\app.js`，无 `C:\Users`、`AppData` 或源码路径泄漏。 |
| ACL | PASS | release/services/config 为 LocalService ReadAndExecute；logs/data 为 LocalService Modify。 |
| API 健康 | PASS | 4320 `/health` HTTP 200，数据库 `ok`；games API 为 45 条。 |

## 恢复能力

| 检查项 | 结果 |
|---|---|
| 正常重启 | PASS：服务重新 Running，4320 恢复监听，DB `ok`。 |
| 强杀 API 子进程 | PASS：精确终止已验证的 LocalService Node 子进程后，服务自动恢复为 Running，4320 新 PID 监听且 DB `ok`。 |

## 访问与浏览器验收

| 检查项 | 结果 |
|---|---|
| localhost / LAN / 外网页面、CSS、JS | PASS：均 HTTP 200。 |
| localhost / LAN / 外网 games API | PASS：均 HTTP 200，45 条数据。 |
| 外网页面强刷 | PASS：`/admin/PublicOpinion/index.html` 非 504、非白屏、无加载残留，概览页面正常渲染。 |
| 外网 Console | PASS：error/warn 为空。 |

## 保护状态

- 3001 PID 25008 与 3306 PID 6064 保持不变。
- 旧任务保持 `Ready / Ready / Disabled`。
- `.temp/windows services preflight *` 残留为 0。
- 外网根路径 `/` 返回 404、3001 仍为临时代理，均为已知风险，不构成 API 服务验收失败。

## 结论

**PASS。** PublicOpinionApi 的 ProgramData 版本化运行包、LocalService 权限边界、正常重启、强杀自动恢复及浏览器访问均通过。仅就 API 阶段，测试负责人同意项目经理评估是否进入 Worker 阶段；Worker 本身未被本次安装或验收。
