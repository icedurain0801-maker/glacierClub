# v005 四卡同源与负面热帖深链

日期：2026-09-16
Status: ready_for_qa

- 概览四卡：发布内容、负面内容、关注级内容、当前告警；不恢复人工验证卡。
- 负面/关注计数直接调用既有 `getContentStats`；负面热帖调用既有 `listContents(sentiment=negative)`，不额外限制帖子或分析状态，保留Top10和互动量/负面强度排序。
- API返回规范化的精确内容时间窗口；概览使用该窗口生成完整负面深链，包含地区/社区/平台/负面模式/负面情感/发布时间半开区间，清page/contentId。
- 内容页保留精确ISO窗口，不再截日期并扩一天；用户筛选pushState，初始化规范化replaceState，popstate恢复日期、模式、页码及其他筛选。
- 内容统计清除模式维度谓词后复用固定维度统计，避免负面深链的sentiment残留缩小关注维度。
- 仓储与真实测试库API定向测试已新增；浏览器与独立验收待执行。不push、不发版。
- 仓储2/2与真实测试库概览/API3/3通过，覆盖负面评论、关注级正面、删除排除、终点排除、计数与ID/排序同源。仅补独立测试库的列表索引、分析字段/任务表fixture，不改真实数据库。
- 热帖输出保留既有字段白名单，不把复用列表的raw_payload额外输出到概览。
- 后端全量测试406/406通过；四个主要JS语法检查与git diff --check通过。
- 刷新本机4320 API进程以加载本单代码；数据库健康正常。localhost、LAN、外网正确入口/admin/PublicOpinion/index.html、app.js及overview API均200，API含attention及精确window。域名根目录/为404，不是实际原型入口。
- 真实Playwright开发自测1/1通过，覆盖桌面1440x900、移动375x812及today/7d/30d四卡、完整负面深链、内容请求精确边界和刷新保持，Console无error/warn。脚本：public-opinion-system/.tests/2026-09/2026-09-16/v146_four_cards_browser.test.js。
- 按用户最新口径省略小需求单独代码审核，开发自测完成后直接交测试负责人；独立验收结果待回报，不将开发自测冒充最终PASS。
