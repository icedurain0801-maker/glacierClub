# 钉钉单条独立通知（方案二）

- 已确认：采用方案二；补充发布人ID及帖子ID（评论标注评论ID）。
- 修改：worker/src/collectionDingTalk.js，每条内容独立生成一条 Markdown 消息；原文摘录、真实 AI 原因、作者、发布人ID、内容ID、北京时间与详情入口分区显示。
- 原文最多300字符、原因最多800字符，超出带省略号，完整内容通过详情查看；标题取原文前32字符，超长加省略号；下方“原文”展示原始内容，不额外调用AI。
- 转义原文 Markdown，避免标题/分隔线/伪链接破坏排版；不展示批次UUID。
- 保留既有风险筛选、每条3.5秒发送间隔、防重日志、超时不盲重发及单次100条上限。
- 验证：collectionDingTalk.test.js 与 baas-dingtalk.test.cjs 共23项隔离测试通过；新增单条消息、ID、Markdown转义、时间格式、空字段及长文本验证。
- 旧测试首次扫描时间修正为现有12小时回看行为，未修改扫描策略。
- 浏览器：使用真实 messages() 输出的模拟数据生成预览，检查两条独立通知及字段；不代表真实钉钉客户端渲染已验收。
- 生效状态：用户弹窗批准切换；现役计划任务入口为 C:/ProgramData/PublicOpinion/releases/release-20261015-dingtalk-layout2-r4/worker/src/baasDingTalkRunner.js。新包425文件校验通过，未主动触发真实告警、未补发历史消息，未提交或推送Git。

- ID纠正：显示ID为原平台 external_id，发布人ID为 platform_author_id；缺失显示“原平台未提供”，禁止回退到内部UUID。查询增加 external_id，详情链接仍使用内部ID。
- 真实数据验证：只读获取两条 X-Clash 内容用于本地预览，移除 player1001/preview-post 等假ID；未发送群消息。

- 中文翻译：原文下增加中文翻译，复用 po_content_translations 中 zh-CN、当前 translation_version 及匹配内容 fingerprint 的译文；不额外调用AI。海外译文缺失时提示稍后在详情查看，不阻塞告警，也不自动重发。
- 验证：两条真实 X-Clash 数据均命中已有译文，浏览器检查原文、译文、AI原因分别展示；现役独立任务入口切换到 r4，未推送Git。

- 字段文案：发布人ID改为发布人大玩家ID，取值仍为 platform_author_id；23项隔离测试与真实数据浏览器预览通过，现役入口已切换到 release-20261015-dingtalk-layout2-r5。未推送Git。
