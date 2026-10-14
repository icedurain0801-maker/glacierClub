# TypeSafe接管自动分析

日期：2026-10-13

## 已执行

- 全局 PUBLIC_OPINION_ANALYSIS_PROVIDER=typesafe。AiAnalyzer构造入口转向TypeSafeAnalyzer，旧构造、chat completions及light/deep代码原样保留，并注释停用入口；legacy可切回。
- API、采集Worker、分析Worker及海外02点定时运行包分别由现役包克隆，仅应用本次代码段；海外排除清单按既有脚本重绑定并保持采集门禁。
- TypeSafe仅文字、每进程并发10、3秒请求超时、最多2次退避重试；全局加密密钥实时读取。无密钥/平台失败不降级调用旧模型、不伪造正常结果。
- 单次返回风险等级、情感、质量和推荐；帖子/评论独立，不继承父帖。原有信心/可核查性/紧急闸门执行一次；持久化及缓存回读不重复跑旧判级。
- TypeSafe选择原文依据片段和依据分类，并保存原始结构化判定。平台不支持自由文本解释，列表明确展示结构化AI依据，不称为自由生成理由。
- 新内容不创建旧深度升级任务；已有未完成deep任务由TypeSafe同接口接管。旧任务版本保留，新缓存独立隔离，已完成历史不因换模型全量重判。
- 对启用来源的13,873条pending/retryable/failed任务恢复pending并清零尝试次数；执行前保存精确任务ID及状态。停用来源、删除内容和孤立无内容任务不绕过门禁。
- API配置页从真实API读取autoAnalysisEnabled，显示接管状态；来源页无TypeSafe入口。

## 验证

- TypeSafe生产适配器隔离测试5/5：工厂切换与保留旧实现、置信/紧急/可核查闸门、持久化回读、10并发、评论独立、401不回退。
- 原配置加密及后台测试7/7通过。
- 同批50条真实生产适配器调用50/50成功，约1.94秒，不写业务结果。
- 实际消费者已写入56条jev-latest结果（验收采样时），包括原未完成深度任务。
- 可见Edge真实API配置页面：API200、全局配置、自动分析启用、无脚本错误。
- 运行包验证API412文件、Worker419/418文件、前端45文件；海外清单411文件重生成，排除绑定5文件通过。
- 两Worker、API、前端服务Running，海外定时任务已指向新运行包。

## 文件

server/src/integrations/typeSafeAnalyzer.js、aiAnalyzer.js；server/src/services/riskSeverityNormalizer.js、typesafeTestService.js；worker/src/worker.js、q1DailyAnalysisRunner.js；scripts/windows-services/copy-worker-runtime.js；.env.example；../admin/PublicOpinion/api-config.html、assets/typesafe-test.js。

## 切回

将受保护运行配置中的PUBLIC_OPINION_ANALYSIS_PROVIDER改为legacy，再重启API/Worker及分析Worker，旧实现仍在。切回会重新使用旧轻量/深度流程，其max_tokens模型兼容问题尚未修复。不要全量重判已完成内容，先明确待接管队列范围。

## 限制

队列查询存在较慢数据库扫描，实际积压消化速度不等同模型50条调用速度。TypeSafe质量/推荐也是结构化判断；未作运营盲标精度验收。本次未推送Git。

内容详情页真实浏览器复查：页面可登录加载，但社区/内容查询长时间等待，未完成详情展示验收；配置页面及全局API已通过真实浏览器。该加载瓶颈需要单独处理，不能声称详情自测通过。
