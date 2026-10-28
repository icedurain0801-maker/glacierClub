# 海外高频反馈中文翻译

## 2026-10-20 词云、排行榜与情感筛选

讨论关键词右上角增加词云图/排行榜切换，默认词云。排行榜展示排名、关键词和反馈数量，前三名徽标、横向数量条；海外展示中文与原文。新增全部/正面/负面选择，复用当前日期及社区范围。全部包含中性与未分析内容，正面/负面按已有分析结果独立计算前50项，至少2条反馈，同一内容重复出现只计1条。两种视图与三种情感均由一次概览响应提供，切换不发API请求。

修改前端 index.html、assets/app.js、public-opinion.css；后端 frequentFeedback.js、baasReadRepository.js、repository.js、app.js，以及统计测试。翻译按三个分组的原文去重后复用同一次翻译及缓存，保留每组计数。无数据库迁移、采集或推送规则修改。

验证：统计和翻译8项通过；本地真实 Chromium 隔离浏览器验证视图切换、情感切换、数量、翻译、空数据、移动宽度无横向溢出、切换零fetch通过。仓储回归13项失败，与此次修改前备份代码运行相同测试的失败名称完全一致（无新增失败）；未修复无关问题。语法和diff空白检查通过。

现役API release-20261020-resilience-r1、前端 release-20261020-weekly-two-lines-r1仅替换相关统计/渲染片段；API短暂重启后Running。本机3001及https://club-opinion.q1.com的HTML/JS/CSS均HTTP200且包含新功能，资源版本20261020-feedback-views-r1。真实概览数据验收受现有查询Token失效401 BAAS_LOGIN_REQUIRED阻断，未绕过鉴权；线上登录后实际分组数据尚待验证。临时备份/浏览器截图/验收脚本在E:/CodexData/projects/.temp/frequent-feedback-20261020/。

Status: deployed, 2026-10-20

海外社区概览的高频词、短语、句子在原文下方显示中文翻译，反馈条数和筛选日期聚合口径不变。国内社区不触发翻译。一次将最多12项缺失翻译合并请求；复用现有AI翻译配置和数据库每日调用额度。结果持久缓存于 E:/CodexData/public-opinion/data/feedback-translations/cache.json，模型或原文变化使用新缓存键。并发请求串行合并，切换日期复用缓存。

翻译失败保留原文并提示稍后刷新，不将失败缓存为完成；JSON条数、ID、重复项、空翻译均校验后才缓存。过滤常见日语助词和礼貌词尾，避免单独词尾被当作反馈。此过滤没有改动业务AI分析规则。

更新 server/src/services/feedbackTranslations.js、frequentFeedback.js、server/src/app.js；前端 assets/app.js 和 public-opinion.css。现役 API/frontend3001 对应文件已更新，API已重载并恢复 Running。

验证：频词统计与翻译5项测试通过；海外昨日真实概览HTTP200，示例「ハロウィン→万圣节」「楽しみ→期待」，均translationStatus=completed。语法与空白检查通过。首次缺失缓存翻译会增加一次模型调用时间，之后复用本机缓存。

2026-10-20追加：排除中日韩英单独助词、程度词、问候语和两字母英文碎片，保留活动、匹配等有意义的短词及完整反馈句。4项统计测试通过。现役运行包已变更为release-20261020-resilience-r1，已在实际运行包更新并重载；今日海外真实概览HTTP200，너무/した/so/진짜/hi均已排除，fillers=[]；中文翻译正常。

2026-10-20再次调整：用户要求参考关键词词云，泛化高频碎词无价值。提取仅保留配置的中日韩英游戏领域具体对象及反馈表达，不使用泛赞作为结果；过滤相同数量且去空格后重叠的片段，最多50项。前端改为彩色词云，字号按反馈条数缩放，点击显示数量、原文/中文；现役release-20261020-resilience-r1和frontend release-20261020-weekly-two-lines-r1均已更新。
验证：5项统计测试通过，国内today/yesterday/7d和海外yesterday真实API均200，泛赞已排除；前端HTTP资源确认词云标题、点击处理、样式均已返回。浏览器Playwright连接Transport closed，未完成浏览器点击/视觉验收，未冒报。当前具体讨论筛选使用领域表达词典，未使用语义模型聚类；陌生新游戏专有名词可能漏选，跨语言相同中文译文仍按各自原文统计。
