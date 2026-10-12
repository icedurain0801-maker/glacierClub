---
status: PASS_FOR_RELEASE_PREFLIGHT
date: 2026-09-22
role: test-owner
evidenceId: 20260922T000000Z-v334-formal-preflight
parentEvidenceId: 20260922T000000Z-v333-scheduled-catchup-window
---

# v334 正式发布预检独立 QA

## 结论

**PASS，允许进入正式发布预检；不允许据此发布、执行真实 Run 或宣称抓取恢复。**

## 独立结果

- `READY.json` 状态与 evidenceId 一致：`READY_FOR_RELEASE_PREFLIGHT` / `20260922T000000Z-v334-formal-preflight`。
- 候选 manifest：24/24 文件存在；payload：8/8 文件存在。
- `checksums.sha256`：31/31 条逐文件复算通过。
- formal-file-closure 中 Worker/Server 目标文件与当前工作树 hash 对齐；前端 formal 文件尚未进入当前工作树，符合发布前状态。
- Worker 调度/槽位：27/27 PASS。
- Server repository：145/145 PASS。
- collection-run detail：1/1 PASS。
- 候选 mock3000：桌面和 375px 均 PASS，GET/HEAD only；验证后已关闭临时 3000 mock。
- 未访问 3001，未写 DB，未切换 release，未发布、未 push、未执行真实 Run。

## 已核对业务证据

- effective `windowEnd=2026-09-21T16:01:09.000Z`。
- 北京时间 00:00:10 内容纳入；`windowEnd` 内容排除。
- posts/comments 共用半开区间 `[windowStart, windowEnd)`。
- `4717` 帖子声明评论数与 `4265` 真实评论正文数分开。
- 空新增、最近槽 catchup、Discord/TapTap 窗口回归均有通过证据。

## 发布后仍必须验收

- 正式 API/Worker 同版版本、health/ready、进程路径和启动时间。
- 下一次正常定时 Run 的实际 `windowEnd >=` 执行截止时刻。
- 正式 3000 用户路径的概览、任务列表、任务详情及 GET/HEAD-only network 证据。
- 不安排历史补跑；补跑另行排期。

## 重要业务限制

BigPlayer 历史高 FAIL 主因仍标记为 `CREDENTIAL_NOT_FOUND`。本候选只修复 scheduled_catchup 窗口上界和详情统计口径，不能证明运行时凭据已恢复，也不能把候选 PASS 写成抓取恢复。

## 证据路径

- 候选：`.temp/candidates/v334-bigplayer-scheduled-catchup-formal-preflight-20260922/`
- 发布后排期：`.tests/2026-09/2026-09-22/v335_v333_post_release_acceptance_schedule.md`
- 前一轮候选 QA：`.tests/2026-09/2026-09-22/v334_v333_bigplayer_scheduled_catchup_window_independent_qa.md`
