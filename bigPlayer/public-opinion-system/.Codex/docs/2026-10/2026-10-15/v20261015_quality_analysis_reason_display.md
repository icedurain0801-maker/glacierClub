# 优质内容 AI 分析原因展示修复

Status: released-local-service
Date: 2026-10-15

用户要求：移除“推荐原因”及其占位内容，只保留真实AI分析正文。

修改 ../admin/PublicOpinion/assets/alerts.js：列表和详情统一读取非空 analysis_reason / analysisReason，HTML转义；列标题改为AI分析原因，详情单独展示正文。缺失原因显示暂无AI分析原因，不用quality_reason冒充，不修改历史数据。
修改 ../admin/PublicOpinion/alerts.html：更新脚本缓存版本。

发布从现役 release-20261015-push-types-frontend-r1 复制最小补丁，只替换原因展示与缓存版本，保留其余现役功能。现役包为 release-20261015-push-types-frontend-r1-analysis-reason-r1。仅切换前端服务，旧XML备份在当日.tests目录。

验证：工作区及候选14项字段/空值/转义/列表/详情断言通过；node语法检查、git diff --check通过；47文件manifest验证通过。服务health 200、静态脚本200且与运行包一致、匿名优质内容接口401。登录浏览器真实加载49条候选；帖子1607709和1607002均直接显示已保存AI分析正文，无推荐原因与重复前缀；1607709详情正确显示同一原因。浏览器error日志为空。截图：.tests/2026-10/2026-10-15/quality-analysis-reason-live.png。

首次测试直接require现役模块，因未导出helper报TypeError；已改用隔离VM测试真实函数，14项全部通过。

未提交或推送Git；未上传BaaS静态托管；未重判或写历史业务数据。
