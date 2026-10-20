# 平台内容 ID 文案修正

Status: implemented-and-tested; not-released
Date: 2026-10-14

## 问题与范围

Last Light 的 Discord 内容使用原始消息 ID，例如 `1559705668884107296`（19 位）。原表头“帖子 ID”容易被理解为 BigPlayer 当前常见的 6 位帖子编号。只读接口已确认 external_id 与 Discord 来源链接末段及浏览器显示一致，未发现 ID 加长或字段映射错误。

用户在获知检查结论及“改为平台内容 ID”的建议后要求修复。本次统一展示文案，保留各平台原始 ID 和现有 postId 参数的精确匹配逻辑，不截断、不补零、不转换为 JavaScript 数字。

## 修改文件

- `../admin/PublicOpinion/assets/content.js`：表头改为“平台内容 ID”，提示编号格式与长度因平台而异。
- `../admin/PublicOpinion/content.html`：搜索提示改为“平台内容 ID（精确匹配）”，增加相应可访问标签及完整 ID 提示，更新脚本缓存版本。
- `../admin/PublicOpinion/assets/alerts.js`：优质内容列表同类表头与 ID 标签统一。
- `../admin/PublicOpinion/alerts.html`：更新 alerts.js 缓存版本。

保留上述文件原有未提交的紧急告警复核修改，没有覆盖或发布其他改动。无后端 API、数据库、ID 格式或历史记录修改。

## 验证

- `node --check`：content.js、alerts.js 通过。
- `git diff --check -- <本次四个文件>`：通过。
- `node --test server/test/discordConnector.test.js`：7/7 通过，结果见 `.tests/2026-10/2026-10-14/platform-content-id-tests.txt`。
- 启动真实可见 Edge，加载工作区候选 content.html/content.js，连接现役只读 API。验证新表头、搜索提示、可访问标签、原始 ID 完整显示及输入完整 19 位 ID 后精确匹配。
- API 返回 200，匹配一条 Last Light / Discord 内容；external_id、来源 URL 末段、列表显示三者一致。
- 浏览器结果及截图：`.tests/2026-10/2026-10-14/platform-content-id-browser.json`、`platform-content-id-browser.png`。
- 浏览器复用既有登录配置及官方 SDK 缓存，未验证 SDK 远程下载链路。只读验证未采集、未重新分析、未写业务库。

未提交、未推送、未上线；现役页面将在后续明确授权发布后才出现本次文案。
