# 概览卡片展示AI分析原因

日期：2026-10-14。状态：已启用，真实浏览器验证通过。

用户要求将“内容与议题”中紧急告警内容和关注级内容卡片的“内容摘要”换成AI分析原因。

## 修改

- `../admin/PublicOpinion/assets/app.js`：卡片辅助文案读取 `analysis_reason`，兼容 `analysisReason`，标签为“AI分析原因”。没有理由时显示“暂无AI分析原因”，不使用摘要或原文作为分析理由。
- `server/src/db/repository.js`：概览精简内容列表增加 `analysis_reason` 返回字段。原内容列表接口已返回该字段，概览首次渲染也使用真实分析理由。
- `../admin/PublicOpinion/index.html`：更新概览脚本缓存版本。

从现役前端及API分别复制运行包，仅应用上述补丁，校验旧文件哈希后切换服务；保留并行已完成的版块短名称、来源链接移除等改动。没有重算AI、修改判断、修改审核状态或触发采集。

## 验证

- 修改JS语法与限定路径空白检查通过，API运行包依赖加载通过。
- 可见Edge访问已登录后台概览，使用真实接口响应，没有模拟数据。
- 紧急告警帖子/动态2条、评论2条，关注级帖子/动态6条、评论18条，共28条卡片，逐条核对DOM文案与接口实际 `analysis_reason` 一致；全部都有真实原因。未出现“内容摘要”标签，无页面脚本异常。
- 证据：`.tests/2026-10/2026-10-14/overview-ai-reason-browser.json`、`overview-ai-reason-browser.png`。
- 运行包清单：`overview-ai-reason-release-manifest.json`。

已有记录若未保存AI分析理由，将按上述空值文案展示，本次不补生成历史理由。
