# 内容管理风险卡片排序、紧急告警及默认关注级

Status: released

## 修改

- `../admin/PublicOpinion/content.html`：卡片顺序为关注级内容、负面待处理、紧急告警，初始关注级选中。
- `../admin/PublicOpinion/assets/content.js`：未明确指定contentMode/riskMode/contentType时默认attention；保留明确深链接。统计接入现有stats.urgent，加载和失败状态同其他卡片。紧急卡片复用既有urgent筛选契约。
- `../admin/PublicOpinion/assets/content-modes.css`：紧急告警红色状态，三卡片适配中等宽度。

## 验证及发布

语法和指定路径空白检查通过。Edge候选验证卡片顺序、默认attention、negative/urgent/attention请求与severity一致、明确urgent深链接、窄屏布局，无pageerror。真实统计样本关注级2、负面0、紧急0。

运行包基于切换前最新现役版本，仅上述3文件改变并更新manifest，36文件包校验通过。前端3001发布至`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-content-risk-cards-1791786187860`，确认实际监听PID43724运行新入口。旧包保留可回滚。本轮未改API、数据库、Worker，未推送Git或发送消息。

候选及外网验收证据：`.tests/2026-10/2026-10-12/content-risk-cards-{candidate,live}.{json,png}`。
