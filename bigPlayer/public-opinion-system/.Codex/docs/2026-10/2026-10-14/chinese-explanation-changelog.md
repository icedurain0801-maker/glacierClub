# 分析原因统一简体中文

日期：2026-10-14

用户要求后续AI分析原因统一使用简体中文。

普通原因生成和独立紧急复核均明确要求reason用简体中文解释具体问题及判级依据，外语/繁体内容转述为简体中文；quote保留连续原文，产品名和技术词可保留。展示顺序改为中文说明在前，原文依据在后。解释缓存版本更新，不复用旧格式缓存。

语言校验检查reason含汉字、汉字占字母至少60%，不含韩日等其他文字脚本；不合格返回语言错误，经已有分析失败/队列重试机制处理，不以模板完成。简繁汉字无法仅凭脚本判别，简体由模型提示约束；允许保留产品名/技术词。该校验不改变风险等级和原文证据校验。

修改文件：`server/src/integrations/chineseExplanation.js`、`typeSafeExplanation.js`、`typeSafeUrgentReview.js`、`typeSafeAnalyzer.js`。

验证：18项相关隔离测试通过；收紧语言比例后8项解释相关测试重跑通过。实际配置模型韩语、英语、日语样本均生成中文解释，保留原文依据；测试出现过非法返回，按校验拒绝并在测试内最多3次模拟队列重试，未落库。JS语法和定向空白检查通过。

真实可见Edge浏览器读取原详情，以隔离响应替换本条原因为实际模型的新解释，确认中文在前/外语依据在后，无模板代码和JS错误。该浏览器验证不修改历史数据。证据：`.tests/2026-10/2026-10-14/chinese-explanation-live.json`、`chinese-explanation-browser.json`、`chinese-explanation-browser.png`。

仅分析Worker定向升级，现役包：`C:/ProgramData/PublicOpinion/releases/release-20261014-chinese-reason-worker-r1`，服务Running。没有修改采集、API、推送配置；历史记录不批量回填，用户主动重新分析时使用新规则。未提交或推送Git。
