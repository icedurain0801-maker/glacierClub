# v159 WinSW v2 同名布局：安装前静态复验

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 初验结论：**BLOCKED**（ACL 已修复）
- 复验结论：**PASS — 允许进入已授权的真实安装分段验收**

## 已通过

| 检查项 | 独立结果 |
| --- | --- |
| 同名发现命令 | `install-services.cmd` 部署并调用 `%SERVICE_ROOT%\%%S.exe install`；卸载、状态、回滚分别经相同包装器调用 `uninstall`、`status`、`uninstall`，不传 XML 参数。 |
| 旧命令回归 | `validate-artifacts.ps1` 静态检测拒绝 `winsw.exe install <xml>`；本次输出 PASS。 |
| XML 与渲染逻辑 | 模板 service ID、入口、低权限账户、日志目录、5/30/60 恢复与 worker 运行配置均受静态校验。 |
| 默认零副作用 | install / uninstall / status / rollback 的 `/dry-run` 均退出 `0`，输出明确不改服务、文件、任务、环境变量或进程。 |

## 沙箱补件复验

交付目录：`.temp/windows-services-stage-b1/winsw-v2-sandbox/`

| 检查项 | 独立结果 | 判定 |
| --- | --- | --- |
| 同名四工件 | `PublicOpinionApi.exe+xml`、`PublicOpinionWorker.exe+xml` 齐全，两个 EXE 长度相同 | PASS |
| EXE SHA-256 | 两份 EXE 均为 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` | PASS |
| XML SHA-256 | Api=`ADFE765D5997686584814980397F4691590EF27119997B9A409D3E0AD8D47B9E`；Worker=`D1207A86B1690CD73BA36396D1A03BA5FE9BDEEC2A1846B2FE1B57A064234017` | PASS |
| XML 同名配对 | XML `service.id` 分别为 `PublicOpinionApi`、`PublicOpinionWorker`；入口、工作目录、独立日志路径正确 | PASS |
| ACL 白名单（复验） | 关闭目录和四文件继承后，严格执行 `validate-artifacts.ps1 -DeploymentRoot <sandbox>` 输出部署同名布局、wrapper hash 与 ACL 白名单均有效 | PASS |

此前 ACL 失败已由重建沙箱修复。本次测试直接运行严格部署根校验通过；测试以该可复验结果为准。

## 退回条件

已满足：严格 ACL 与同名工件门禁通过。可在用户已授权范围内进入真实安装；后续仍须独立验收服务唯一实例、启动恢复、DB 中断恢复、三层页面/API、Worker 状态与 catchup。旧任务停用继续需要单独门禁。
