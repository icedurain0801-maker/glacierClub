# 国内当天漏数修复：现场进度

Status: partial，未宣告全天或长期修复完成。

用户最新授权：仅国内 2026-10-09 当天漏数修复。已取消海外工作不恢复。

| 事项 | 状态 | 证据 |
|---|---|---|
| 真实首页补采 | 已执行 | v8 串行 20 页，新增 116 帖子；第 7～20 页无窗内帖子，但仍有后续页，保留 checkpoint |
| 最初 16 个漏采 ID | 已补齐，独立 QA 通过 | v042 独立前两页 QA：36/36 详情 SHA、归属、UTC 时间、AI job fingerprint 闭合 |
| 今天数据可查 | 已验证接口 | 最新本机 3001 GET HTTP 200，total 193（116 帖子 + 77 评论） |
| AI | 193/193 完成，独立终验通过 | 两条 retryable 经现役异步机制自然完成；193/193 分析结果 fingerprint 匹配，未修改算法 |
| 后续 80 帖独立 QA / 页面 | 帖子全量及页面已通过 | v056：后台可见帖子 116、评论 77，77 评论列表可见 |
| 当天评论与回复 | 本次 50 个有评论目标全部单任务完成，新增 77 评论，独立终验通过 | v056：50 checkpoint completed/leasefree，77/77 raw、父链、UTC、AI fp 通过；全部报告 replyTargets 空，非全社区评论穷尽 |
| 评论目标 926802 | 唯一重试成功，独立 QA 通过 | 原失败报告保留；重试新增 1 评论，cp completed/items1/leasefree；不再重跑 |
| 评论目标 926820 / 926875 | 唯一诊断运行后成功，独立后验通过 | 原失败均 comment_upsert / operation6 / ER_LOCK_WAIT_TIMEOUT；原失败报告保留，未捕到阻塞索引，根因未知 |
| 锁诊断复现 | 两目标各一次已执行 | 独立硬目标采样器 + 唯一新输出，500ms 守候/150ms 短采样；均未捕到 wait，不能证明根治 |
| 其他分区 / 当天全集 | 待完成 | 首页预算停止为 PARTIAL，不凭排序观察宣告穷尽 |
| 长效调度 | 待确认 | 现役 Worker 心跳正常；国内 next_scheduled_at UTC 06:00（上海 14:00） |

捕获窗口固定为上海 2026-10-09 00:00 至 12:31:29.177；不能宣称未来全天已齐。

执行证据位于仓库根 `.temp/domestic-today-recovery-20261009/first-segment-v8-execution.json` 与 `first-segment-v8-page2` 至 `page20-execution.json`。不覆盖旧失败报告。

本次未重启、改动共享 Worker、现有调度、TapTap、Discord、Facebook、算法；未执行 DDL、删除历史、push 或恢复海外任务。

13:08 左右快照：目标源今天数据库为 116 帖子 + 20 评论。帖子 AI 最新独立 QA 为 75 completed / 41 pending，非全部完成。
服务 XML 白名单证实 WORKER_MODE=enabled、UNIFIED_SOURCE_SCHEDULER_MODE=enabled；现役统一调度静态接线存在。08:00 捕获结束后发布的上午新帖尚未落入下一次 14:00 调度窗口，不能因此断言掉线；14:00 的真实 enqueue/抓取尚未验收。

最终独立证据索引：`.tests/2026-10/2026-10-09/v056_domestic_116_posts_77_comments_final_snapshot_qa.md`。
结论：今天零数据问题已通过真实补采解除；已知捕获窗补数及 AI PASS。两个评论 AI job `6882071` / `6882174` 先前 retryable，约上海13:30经正常异步机制完成；独立 QA 复跑193/193结果匹配、issueCount0。首页穷尽、其他分区、旧父帖/回复、捕获窗后新增、14:00 实际调度及间歇锁根因仍未验收，完整发版不通过。
