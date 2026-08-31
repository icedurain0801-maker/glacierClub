# Q1 每日任务入口与凌晨执行约束确认

日期：2026-08-31

## 结论

继续使用仓库已有入口 `public-opinion-system/worker/q1-daily.cmd`，不创建新入口、不启动重复批次。计划任务 `\\BigPlayer Q1 Daily 02` 已存在并启用，每天北京时间 02:00 执行，任务命令内使用已配置的 `Q1_SOURCE_ID`。

## 本次修正

`worker/q1-daily.cmd` 不再使用 Windows 当前日期拼接 `Q1_DAILY_OUT_DIR`。输出目录统一交由 `src/q1DailyJob.js` 按 `previousBeijingDay()` 计算的业务日期生成，避免凌晨执行时目录名使用当天日期而任务窗口实际处理前一天造成混淆。入口、互斥锁、导入批次和分析作用域均未改变。

## 已确认行为

- 业务窗口固定为北京时间前一天 `[00:00:00, 次日 00:00:00)`，Node 侧转换为 UTC 半开区间。
- 先执行现有业务日期 lock；运行中或已有完成批次时跳过。
- 抓取、导入完成后只使用本次导入返回的 `analysisEligibleIds`。
- 轻量分析完成后，由轻量结果触发已配置的深度分析，并等待活动任务进入终态。
- 任务目录保留 `summary.json` 和 `daily-report.json`。
- 日志和报告只保留统计字段及稳定错误码、阶段和脱敏错误信息。
- 不输出 Q1 token、Cookie、密码、AI key、Authorization、请求头或原始响应。

## 验证

- Python 抓取器测试：11/11 通过。
- Node 每日任务、分析 runner、业务日期测试：21/21 通过。
- 计划任务：已存在、已启用，仍使用 `q1-daily.cmd`，未新增重复任务。
- 当前 2026-08-31 任务已由现有 `q1DailyJob.js` 执行中，未进行第二次启动或干预。
