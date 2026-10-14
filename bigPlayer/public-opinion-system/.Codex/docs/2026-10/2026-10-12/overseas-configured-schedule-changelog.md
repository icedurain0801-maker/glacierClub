# 境外社区按配置频率采集修复

Status: 已启用并验收（未提交、未推送 Git）

## 问题与修复

- 海外计划任务实际入口将 `--execute` 强制转为即时刷新，生成 manual 任务且不推进调度状态；底层旧 scheduled 分支也按每日 02:00 固定计算。
- 共享 Worker 已切换到 feed-recovery-v11，海外隔离清单仍指向 domestic-six-hour-window-r1。严格进程/哈希校验失败，采集尚未开始即退出。
- 正式入口改回 scheduled。复用 `scheduleSlots.computeSchedule`，读取来源 `frequency_seconds`、`schedule_effective_at`、`schedule_version` 与已处理时点。旧每日 next 值不再阻挡六小时补抓。
- 保留境外前一天北京时间零点到本次采集时点的重叠窗口，数据库 upsert 去重。重启优先恢复未完成 intent，不重复创建同一时点。
- 完成后按来源频率推进下一时点；配置频率/版本变化的旧新格式 intent 在准入时拒绝。
- Windows 任务每分钟唤醒检查，实际抓取按配置执行；IgnoreNew 保留，未到点或已完成不发采集请求。
- 现役运行包为 `overseas-release-20261012-configured-schedule-r1`。不重启共享 Worker，不改历史内容，不改源频率，不推送 Git。

## 隔离清单维护

新增 `scripts/refresh-overseas-shared-exclusion.js`。重绑定前核验旧清单哈希，并逐文件核验含目标 sourceId 的原排除语句完整保留。任何排除语句变化必须人工审查。运行时继续严格检查文件哈希、服务进程路径、启动时间。

后续共享 Worker 切换时，必须同步为海外运行包生成指向新现役 Worker 的隔离清单，并运行 `--preflight`；不得直接关闭隔离校验。用法：

```text
node scripts/refresh-overseas-shared-exclusion.js <旧shared-exclusion.json> <新共享Worker目录> <新清单输出路径>
```

部署前后任务定义和切换脚本保存在仓库根 `.temp/overseas-schedule-repair/`，业务目录不保存临时文件。回退须保留当前共享 Worker 隔离绑定，不能直接恢复已经失效的旧清单。

## 验证

- 23 项测试通过，覆盖全部支持频率、北京时间跨月边界、旧 daily 状态补抓、同槽去重、effectiveAt、断点恢复、隔离排除语句丢失及旧清单篡改。
- `node --check` 与 `git diff --check` 通过。
- 现役 `--preflight` 通过，三个站点，零网络、零写库。
- 可见 Edge 已在真实 SSO 会话打开 club-opinion.q1.com 的抓取列表、展开新任务详情；任务详情接口 200，triggerType=scheduled，无页面脚本错误。
- 实际本次父任务：`c6384755-a7c1-57bb-a826-0dfad6ee2596`，对应北京时间 2026-10-12 20:00 时点。
- 20:44:14 开始，20:53:52 完成。父任务和三个子任务均 completed/error_code=null，三个站点各抓取35条，合计105条；新增13、变更90、未变化2，父子任务 attempts 均为1。
- 调度状态 last=2026-10-12 20:00（北京时间），next=2026-10-13 02:00，租约已释放。
- 20:54:54 Windows 自动唤醒返回0，未重复创建20:00父任务，slotCount=1，原父子 attempts 保持1。
- 完成后再次使用可见 Edge 打开运行记录并展开详情，页面“已完成”，真实详情接口200，三个站点结果正常，无页面脚本错误。

## 变更文件

`worker/src/overseasProductionDaily.js`、`worker/test/overseasDateCoverage.test.js`、`worker/test/overseasConfiguredSchedule.test.js`、`worker/test/overseasExclusionRebind.test.js`、`scripts/refresh-overseas-shared-exclusion.js`。

测试证据：`.tests/2026-10/2026-10-12/overseas-schedule-*`。
