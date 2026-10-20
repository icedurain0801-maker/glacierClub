# 周报报告入口与已读提示

Status: 已实施、已更新现役、Chrome 浏览器验收通过

## 需求与实现

首页原周报摘要卡片移除，平台选择框右侧增加文档图标与“报告”按钮。点击打开居中弹窗，展示完整摘要、统计周期、分析覆盖和生成日期。支持关闭按钮、Escape、点击遮罩关闭及焦点恢复；窄屏允许滚动阅读全文。

已读键由现有 SSO identity.id、communityId、周报 week_start 组成。仅完整摘要加载成功且弹窗打开后标记已读，新用户、其他社区和新一期独立显示红点。加载、生成中、无摘要、失败不误标已读。原文转义后显示，社区切换使用请求序号防止旧请求覆盖新报告；保留原社区级统计口径，不改平台、日期筛选。

已读状态存于当前浏览器 localStorage，刷新保留，同浏览器多页签同步；换电脑或清除浏览器数据后会重新显示红点。无可用持久化存储时回退至本次访问内存状态。

## 变更文件

- `../admin/PublicOpinion/index.html`
- `../admin/PublicOpinion/assets/weekly-report.js`
- `../admin/PublicOpinion/assets/weekly-report.css`

## 验证与更新

- 独立 Chrome 隔离验证10组行为，含用户/社区/期次隔离、刷新、未生成/失败状态、HTML转义、请求竞态、窄屏。
- 候选与发布后，独立 Chrome 访问 `https://lfy3001.dev.q1op.com/?boardId=2`，使用真实接口确认786字周报全文、红点消除与刷新保留。首页相关已请求接口均返回200，页面脚本无错误。此入口为免登录只读；真实 SSO 多账号切换未操作，用户隔离由身份字段及模拟身份用例验证。
- `node --check`、`git diff --check`、运行包50文件清单验证通过。
- 原候选制作后发现现役已更新为 `release-20261020-facebook-browser-r1`，首次切换因基线检查主动停止；最终在最新现役上仅带入本任务3个文件，保留其Facebook改动。
- 现役前端：`release-20261020-weekly-report-icon-r2`。旧XML保存于仓库根 `.temp/playwright-mcp-connect/frontend-before-weekly-report-icon.xml`，旧运行包保留可回退。前端健康检查通过。
- 不改 API、数据库、周报生成或采集流程，不推Git、不提交BaaS。

## 待办完成情况

| 项目 | 状态 |
|---|---|
| 核对现有周报接口、身份、平台位置 | 完成 |
| 报告按钮、红点、全文弹窗 | 完成 |
| 隔离和真实Chrome验收 | 完成 |
| 最小运行包更新及发布后复验 | 完成 |
