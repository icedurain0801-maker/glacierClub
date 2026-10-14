# 严重内容缺少告警事件时仍在概览展示

Status: released
日期：2026-10-12

## 原因与结果

境外 Last Night 社区 2026-10-11 的严重内容 `373ba313-7397-42a6-a272-d761c13ebca4`，轻分析完成且结果为 negative/urgent，深度分析任务失败；该内容没有 `po_alert_contents` 关联，也没有告警事件。紧急卡片按严重内容计数为 1，原告警模块仅展示 pending/processing 事件，结果为空并隐藏。

概览现在同时展示真实待处理事件与未关联任何事件的严重内容。未关联内容标注“严重内容 · 尚未生成告警事件”，支持“查看”详情。只有未关联严重内容时，“查看全部”进入同范围 urgent 内容列表。内容管理补齐 urgent 模式，避免跳转后回退普通帖子筛选。

## 文件与边界

- `server/src/db/repository.js`：概览增加 `urgentUnlinkedContents`（最新 20 条）和 `metrics.urgentUnlinkedTotal`。查询采用同一地区、游戏、社区、采集源、平台、发布时间窗，排除删除内容，限定 neutral/negative + urgent，通过 NOT EXISTS 排除已有任何事件关联的内容。
- `../admin/PublicOpinion/assets/app.js`：两类行分别使用事件详情和内容详情入口；仅两类均为空时隐藏模块。超出 20 条提示总数并提供同范围严重内容列表入口。
- `../admin/PublicOpinion/assets/content.js`：增加 urgent 模式和相应 URL/筛选处理。
- 发布包 `index.html`、`content.html` 更新资源缓存版本。

真实事件继续遵循原 pending/processing 规则，不伪造事件 ID、处置状态或通知状态。当前查询和展示修复不创建事件、不触发分析、不写业务数据、不通知外部人员。该条内容深度分析失败的问题仍保留，未将展示修复作为深度分析成功。

## 发布与验证

以最新 `release-20261012-kind-pagination-r3` 为基础克隆窄补丁，保留并行改动；API 切换至 `release-20261012-kind-pagination-r3-urgent-module-r1`，前端最终切换至 `release-20261012-kind-pagination-r3-urgent-module-r1-r2-r3`。不发布 Worker。

- 隔离测试 6/6 通过：`node --test --test-name-pattern='getOverview|overview' server/test/repository.test.js server/test/overviewUrgentUnlinked.test.js`。
- 新用例验证缺事件严重内容展示契约、范围过滤、删除过滤、只读查询及零条时不加载行。
- 可见 Chromium 外网实测：境外昨日 total=20、attention=1、negative=0、urgent=1；模块显示 1 条未关联严重内容，详情 ID 和正文匹配，“查看全部”保持社区、日期和 urgent 筛选。
- 国内昨日回归：total=451、attention=21、negative=69、urgent=0；模块按规则隐藏。浏览器 pageerror=0。
- 原帖查看能力和最新分页包原有代码保留。
- 证据：`.tests/2026-10/2026-10-12/urgent-module-browser.json`、`urgent-module-overseas-live.png`、`urgent-module-detail-live.png`。
- 发布清单：`v016_urgent_module_release_manifest.json`。
