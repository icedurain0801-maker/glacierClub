---
status: QA_PASS_RELEASE_REVIEW
date: 2026-09-22
role: test-owner
evidenceId: 20260922T000000Z-v333-scheduled-catchup-window
sampleRunId: 3a245915-416b-45c0-93b5-b78be30f9da4
---

# v333 BigPlayer scheduled_catchup 窗口独立 QA

## 结论

**PASS，允许进入 `QA_PASS_RELEASE_REVIEW`。**

本结论仅针对候选离线逻辑、fixture、详情口径和候选自带 3000 mock 只读验收；不代表真实生产修复已部署，不代表真实 Run 或 9/22 漏抓数据已补齐。

## 独立复核结果

- 同一 `evidenceId`：`20260922T000000Z-v333-scheduled-catchup-window`。
- `manifest.json`：17/17 文件存在，逐文件 SHA-256 复算通过。
- 窗口专项：`node --test catchupWindow.test.js`，6/6 PASS。
- Worker 调度/槽位：27/27 PASS。
- Server repository：145/145 PASS。
- 定向覆盖：实际执行截止、posts/comments 同一半开区间、空窗口不误报授权失败、只补最近槽、声明评论与真实正文拆分、Discord/TapTap 窗口不变，全部通过。
- 浏览器 mock3000：临时监听 `127.0.0.1:3000`，桌面和 375px 各执行一次；GET/HEAD only、无 3001 请求，脚本 PASS；验证后已关闭 mock 服务。

## 核心证据

- effective `windowEnd`：`2026-09-21T16:01:09.000Z`（北京时间 9/22 00:01:09）。
- 00:00:10 内容：纳入窗口。
- `published_at = windowEnd`：排除。
- posts/comments：统一 `[windowStart, windowEnd)`。
- 帖子声明评论数：`4717`；真实评论正文数：`4265`；页面分开显示。
- 空窗口返回合法空结果，不映射成授权失败。
- 多槽位 catchup 只处理最近一个未处理槽。

## 限制与残余风险

- 未执行真实 Run、未写 DB、未改正式服务/config、未访问 3001；因此不能宣称生产已修复或历史漏抓已补齐。
- 浏览器证据是候选自带 mock 页面，不是线上/生产页面。
- 候选 READY 声明详情 `1/1 PASS`，但当前正式工作树不存在 `admin/PublicOpinion/assets/collection-runs.test.js`，本项只能以候选 fixture/详情证据接受，后续发布评审应保留该证据来源说明。

## 证据路径

- 候选：`.temp/candidates/v333-bigplayer-scheduled-catchup-window-20260922/`
- 验收清单：`.tests/2026-09/2026-09-22/v333_bigplayer_scheduled_catchup_window_acceptance_checklist.md`
- 候选桌面截图：`browser-evidence-desktop.png`
- 候选移动截图：`browser-evidence-mobile-375.png`
