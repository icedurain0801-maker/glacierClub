# 海外任务取消每分钟检查

Status: 已生效，未提交、未推送 Git

按用户要求，将 BigPlayer Last Night Overseas Daily 02 的 Windows 重复触发间隔由 PT1M 改为 PT6H，与当前来源配置21600秒一致。保留02:00北京时间起点，即02:00、08:00、14:00、20:00触发；保留 wscript 隐藏启动、IgnoreNew及采集器内部频率校验和断点恢复。

没有终止正在运行的任务，没有改变内容数据。失败断点在后续六小时触发时恢复；不再每分钟重试。后续修改来源频率时需同步Windows触发间隔。

验证：重读实际计划任务，间隔PT6H、隐藏启动器保留、下一次触发时间正常。证据：.tests/2026-10/2026-10-13/overseas-six-hour-trigger.json。配置备份位于仓库根 .temp/overseas-hidden-launcher/task.before-six-hour.xml。

本次只调整Windows触发配置，不涉及页面和HTTP接口。
