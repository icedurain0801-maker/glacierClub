# 负面待处理与紧急告警入口合并

Status: released

## 结果

概览和内容管理页仅展示关注级、紧急告警两个风险入口。紧急告警统计及列表同时覆盖已分析为negative和urgent的中性/负面内容；原负面内容面板更名紧急告警内容，帖子/动态及评论Tab保留。内容列表和详情风险文案均将两级显示为紧急告警。默认关注级行为保留。

数据库及AI内部原等级保留用于追溯，不批量写历史记录；本次合并展示、筛选与统计，不改变外部通知发送策略。原负面链接兼容并选中紧急告警入口。

## 文件

- `shared/riskModes.js`：urgent及negative旧入口均过滤negative/urgent，校验允许历史severity参数；attention仍独立。
- `../admin/PublicOpinion/assets/content.js`：两级风险显示统一名称，旧模式恢复为urgent。
- `../admin/PublicOpinion/content.html`：移除负面卡片，保留关注级及紧急告警；共享契约缓存版本更新。
- `../admin/PublicOpinion/assets/app.js`：概览移除独立负面卡片，紧急使用服务端合并数量及帖子/评论拆分。
- `../admin/PublicOpinion/index.html`：合并面板文案及资产缓存版本。
- `server/test/mergedUrgent.test.js`、`server/test/repository.test.js`：新合并范围、历史链接、分页前SQL筛选及统计一致性。

## 验证

相关风险筛选及仓库测试4项通过；合并及玩家流失回归6项通过；语法和指定文件空白检查通过。

全repository测试发现两个既有不相关失败：海外版块父Run boardId，startBoundedSourceBackfill窗口参数；本轮未修改这些实现。原互斥等级测试按新需求更新为合并范围后相关测试通过。

Edge候选和外网均验证：内容页两卡片顺序、旧负面链接选中紧急、合并列表包含negative和urgent、统计数量等于列表集合、概览三卡片总内容/关注级/紧急告警、无pageerror。10月9日真实验收样本合并4条，两种历史等级均包含。

证据：`.tests/2026-10/2026-10-12/merged-urgent-{candidate,live}.json`。

## 发布

API运行包仅改shared/riskModes.js，前端仅改5个本轮资产（含公开shared契约），其余现役文件继承，manifest重写；API402文件、前端36文件校验通过。

- API：`C:/ProgramData/PublicOpinion/releases/release-20261012-merged-urgent-1791789481659`，实际4320进程48936。
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-merged-urgent-1791789482167`，实际3001进程29308。
- 旧包保留，未改数据库或分析/采集Worker，未推送Git或发送通知。

发布准备时risk-gradient-v1包缺shared且4320无监听。曾准备完整依赖候选包，后检测到服务配置已改回完整retention包，最终重新基于当前完整现役包构建，只改本轮契约，不使用结构修复候选，避免覆盖并发更新。
