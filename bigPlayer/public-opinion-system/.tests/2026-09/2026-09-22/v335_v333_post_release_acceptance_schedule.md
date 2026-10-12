---
status: prepared_before_release
date: 2026-09-22
role: test-owner
topic: v333 BigPlayer 零点窗口修复发布后最小验收
---

# v333 发布后最小验收排期

## 范围与禁区

- 仅验正式发布后的 BigPlayer `scheduled_catchup` 窗口修复。
- 发布前不执行真实 Run；不安排历史 9/22 漏抓补跑；补跑另行排期。
- 仅访问 `127.0.0.1:3000` 免登录只读用户路径；不访问 3001，不执行写操作。

## 验收顺序

1. **版本与健康**
   - 记录 API/Worker release、构建版本、启动时间、进程路径和 evidenceId。
   - `health`/ready 检查通过；确认 API 与 Worker 为同一候选版本。
   - 记录迁移/schema/config 版本，只读核对，不执行变更。

2. **窗口记录**
   - 使用下一次正常定时 Run，或项目经理另行批准的受控模拟 Run；不补历史窗口。
   - 核对 `scheduled_at`、`started_at`、`window_start`、`window_end` 均有记录且时区明确。
   - 判定：BigPlayer `window_end >= 实际执行截止时刻`；不得回退到自然日 00:00 导致当天内容被排除。

3. **posts/comments 一致性**
   - 核对同一 Run 的 posts、comments 使用统一 `[window_start, window_end)`。
   - 核对 `published_at < window_end` 的内容进入，等于/晚于上界的内容按同一规则排除。
   - 记录新增、变更、未变化、跳过/越界数量；空新增必须显示窗口内无新增，不得误报授权失败。

4. **详情统计**
   - 3000 任务详情同时展示帖子数、真实评论正文数、回复数、帖子声明评论数。
   - 声明评论数不得冒充真实 comments scope 数量。
   - 详情能解释 catchup 的实际截止时刻及窗口边界。

5. **浏览器证据**
   - 桌面和 375px 移动视口各验一次概览、任务列表、任务详情。
   - 只允许 GET/HEAD；拦截并记录 POST/PATCH/DELETE，任何写请求即 FAIL。
   - 保存 URL、截图、console/network 摘要；确认页面走 3000 用户路径而非 mock 或 3001。

## 放行门槛

- 版本/health、窗口记录、posts/comments 同窗口、详情拆分和 3000 浏览器证据全部 PASS，才可进入发布后验收通过。
- 任一正式入口仍指向旧版本、`window_end` 早于执行截止、详情只显示声明评论、出现写请求或无法确认同版 API/Worker，均 BLOCKED/退回开发负责人。

## 当前状态

候选离线 QA 已为 `QA_PASS_RELEASE_REVIEW`（见 `v334_v333_bigplayer_scheduled_catchup_window_independent_qa.md`）；正式发布后证据尚未产生，本卡不代表生产已验收。
