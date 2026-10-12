# 风险等级按最终级别互斥展示

Status: completed

## 用户最新口径

关注级、负面待处理、紧急告警的内容不得重叠。识别仍逐级晋升，但展示只保留最终所在等级：升级到negative后移出attention，升级到urgent后移出negative。此口径替代此前的递进集合包含展示。

## 实现与边界

- shared/riskModes.js：三个riskMode各映射单一最终severity。列表、计数、树查询、概览卡片和首页帖子/动态及评论分组共用同一规则，保留neutral/negative情感准入。
- server/src/db/repository.js：补齐urgent帖子/评论内容分项。概览当前告警仅展示关联当前urgent内容的事件；告警管理中的待处理/处理中urgent事件也要求当前筛选范围内的关联内容仍为urgent。当前urgent事件详情过滤已降级或删除内容，不以历史摘要恢复降级链接。已处理历史记录和存储数据保留，不修改事件状态。
- ../admin/PublicOpinion/assets/app.js：紧急卡片恢复用户此前已确认的严重内容条数及内容分项，继续保留其他卡片并行开发的分项展示。
- server/test/repository.test.js：验证三档独占的列表/计数/树SQL和当前告警过滤降级内容、不重新恢复旧链接。
- 分类阈值、AI原文投诉判断、严重程度判定、riskPolicyVersion和历史分析结果均不改变，不执行AI重判、不补发通知。

## 发布

从当前API及前端metric-breakdown-r2运行包分别克隆exclusive-risk-r1，保留现有标题、图片、趋势四分类、卡片分项等并行成果。API只更新shared规则与四个查询方法；前端只更新shared规则、renderMetrics及脚本缓存版本。候选差异已审查。旧包与XML备份保留，更新两服务后健康检查成功。

## 验证结果

- 工作区及候选运行包9项相关隔离测试通过；候选API/前端shared映射均逐档核实为单元素集合。
- 语法及空白检查通过。
- 实际启动可见Chromium访问10/11指定社区外网页面，无请求模拟：总451，关注21（帖子/动态9、评论12），负面待处理69（帖子/动态17、评论52），紧急0（0/0），当前告警事件0。
- 首页帖子/动态页签加载完成后关注9、负面17；评论页签加载完成后关注12、负面20（该首页请求每页20条）。验证显示行数、类型、最终等级及内容ID，两个档位无交集。
- 内容管理全量页分别读取全部21条attention、69条negative，核对每条最终等级且内容ID交集为0；urgent内容查询0。
- 无pageerror。已视觉检查加载完成的卡片和评论双列表截图。

## 证据

- 临时受控脚本、manifest、XML备份：仓库根`.temp/exclusive-risk/`。
- 发布manifest：`v012_exclusive_risk_release_manifest.json`。
- `.tests/2026-10/2026-10-12/exclusive-risk-live-browser.json`记录全量ID及各页签结果。
- 同目录`exclusive-risk-live-cards.png`、`exclusive-risk-live-panels.png`。
