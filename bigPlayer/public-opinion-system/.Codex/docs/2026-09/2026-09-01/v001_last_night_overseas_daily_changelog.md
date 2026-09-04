# Last Night 欧美版每日自动抓取

## 变更内容

- 新增 Last Night 欧美版专用每日入口，只选择已启用的固定游戏、欧美版社区、`bigplayer_h5`、境外 `western` 采集源及其唯一已启用绑定账号；无匹配或多匹配时终止，不回退到其他账号。
- 复用现有 Q1 每日链路，按北京时间前一自然日左闭右开窗口执行采集入库、AI light/deep 分析、幂等锁、日报及日志脱敏。
- 新增 `last-night-overseas-daily.cmd` 运行包装器，以及 `manage-last-night-overseas-daily-task.cmd` 的 `/dry-run`、`/install`、`/remove` 模式；安装配置为本机每天 `02:00`。
- 新增 npm 启动和 dry-run 命令，并增加纯 fixture 范围筛选、fail-closed、链路委托和调度脚本安全性测试。

## 验证

- 专用入口 `--dry-run` 通过，输出北京时间前一自然日窗口，且明确不访问网络和凭据。
- business day、Q1 每日采集、Q1 AI 分析及专用入口离线测试共 25 项全部通过。
- `git diff --check` 通过。
- 未执行真实抓取，未读取或输出凭据，未访问真实社区，未安装、删除、查询或启动 Windows Task Scheduler 任务，未提交或推送代码。

## 操作入口

- 入口 dry-run：`npm --workspace worker run preflight:last-night-overseas-daily`
- 任务 dry-run：`worker\\manage-last-night-overseas-daily-task.cmd /dry-run`
- 安装任务：`worker\\manage-last-night-overseas-daily-task.cmd /install`
- 删除任务：`worker\\manage-last-night-overseas-daily-task.cmd /remove`
