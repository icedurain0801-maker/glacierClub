# 海外日期覆盖与持续增量修复

Status: 已发布；昨天和今天实际入库、外网概览及调度设置验收通过

原海外入口每次只完成一个日期窗口即退出，恢复旧任务没有继续补齐积压；每天02:00执行仅覆盖前一自然日，因此当天数据也无法及时出现。本轮按数据库next_scheduled_at选择最早到期日期，在一次执行内最多补7个日窗口，补齐后执行当天北京时间00:00至当前时间的有界增量窗口。今日窗口使用独立任务/receipt，不推进每日调度水位，内容按既有去重规则存储。失败保留已提交游标，下一次继续恢复。

修改 `worker/src/overseasProductionDaily.js`，新增 `worker/test/overseasDateCoverage.test.js`。日期选择、已补齐不重复、今日北京时间边界3项通过；既有时区与断点恢复2项通过。未改API、前端、数据库结构或国内Worker。

专用运行包基于网络修复现役包，仅collector和启动路径调整，目标 `C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-20261012-date-coverage`。原定时任务已切换至此包，并增加每30分钟触发、StartWhenAvailable=true、IgnoreNew，任务XML备份保留。真实采集进入原入库及分析队列，用户已授权直接修复发布和验收。

验收必须确认10/11及10/12实际内容入库、外网概览有非零日期数据、旧日窗口已补齐与下一触发设置，而不仅检查任务错误码。

## 最终验收

10/11任务 `a72c74f3-04f7-5043-a37d-16b4cafc026f` completed且error_code为空，新增20条帖子；10/12今日任务 `813fbd15-6ab2-5e5e-a271-d46a94fb74c3` completed且error_code为空，新增2条帖子。三个语言站点都完成；语言页重复观察不当作独立新帖计数。外网Edge真实概览yesterday显示20、today显示2，API和页面一致，无JS异常或写请求。证据为仓库根 `.temp/sync-auth-persistence-fix-20261010/date-coverage-browser.json`、`overseas-yesterday-covered.png`、`overseas-today-covered.png`。

调度已设每30分钟触发、错过触发后补执行、禁止并行实例；读取下一触发为北京时间2026-10-12 09:30:30。日期覆盖和整轮编排5项、既有时区与断点恢复2项、网络重试5项验证通过。下一次定时触发的实际执行结果尚未发生，不将设置验证写成实际定时运行成功。

过程中共享Worker被切换至 `worker-release-20261012-progressive-risk-v157-r2`，排除基线保护停止采集；只读核对新Worker仍保留海外来源排除规则后，更新专用包shared-exclusion哈希恢复，未关闭保护或重启共享Worker。今日父任务触发数据库已有CHECK约束后补修为manual且scheduled_at=NULL，按ID查询恢复；未修改数据库结构。请求预算由84提高至240，保留单窗口及分页限额。最终运行包405文件哈希已更新。
