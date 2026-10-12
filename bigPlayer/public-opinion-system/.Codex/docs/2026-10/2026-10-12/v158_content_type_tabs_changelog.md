# 概览内容类型 Tab

Status: 已发布，外网浏览器验收通过

“负面内容”“关注级内容”各新增帖子/动态、评论两个独立Tab，默认帖子/动态。切换时按当前地区、社区、平台、概览精确日期范围及风险类别请求既有contents接口，在服务端过滤类型后按发布时间倒序分页，各显示最新20条，避免先截断混合列表再过滤导致漏项。

类型切换具有独立请求序号，并与概览加载序号、社区epoch共同检查，旧响应不能覆盖当前选择。列表内容纳入现有详情查找；加载、错误与空结果分别显示。“全部内容”携带所选contentType和当前风险/日期/社区参数，内容管理页恢复并保留该类型筛选；切换内容管理主分类时解除从概览带入的类型限制。

工作区文件：../admin/PublicOpinion/index.html、assets/app.js、content.html、assets/content.js。两处资源版本查询更新为158。发布基于现役3001前端包，仅应用这次Tab相关差异；工作区已有但尚未发布的告警统计、趋势未分析样式等其他改动保留，不混入本次运行包。

运行包：C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-content-type-tabs-v158。33项manifest验证、两份JS语法与git diff --check通过。备份原3001 XML后短暂重启PublicOpinionFrontend3001，状态Running；API、Worker、数据库不修改。

发布前及发布后均使用Edge和真实只读接口验证7类场景：默认帖子、独立Tab、分页前类型过滤、快速切换、链接保留类型/日期/社区、内容管理页保持筛选、无写请求。国服昨日样本：负面帖子17、负面评论首页20、关注级帖子首页20、关注级评论首页20，所有返回类型与查询一致，接口HTTP200、页面无脚本错误。20条为首页上限，不表述为类别总数。

证据位于.tests/2026-10/2026-10-12/overview-type-tabs-live.json、overview-type-tabs-live.png，正式浏览器验收脚本check-overview-type-tabs.cjs。无Git提交或推送，无站内信发送。
