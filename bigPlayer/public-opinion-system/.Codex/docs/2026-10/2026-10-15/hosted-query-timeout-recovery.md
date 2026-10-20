# 托管页面内容查询超时恢复

Status: recovered; cloud-query-redesign pending

## 故障与证据

- 用户入口：`https://chat.q1.com/apps/public-opinion/admin/PublicOpinion/content.html?boardId=100017`，Last Light 今日卡片及列表超时。
- API、前端、采集、分析、翻译和登录服务均在运行；API根路径和认证配置正常响应。独立数据库只读进程列表没有发现持续锁等待。
- 现役 API 使用 `PUBLIC_OPINION_DATA_READ_BACKEND=baas`，内容查询依赖 `BaasReadRepository.load()` 建立全量快照。云端共 10,049 条文档，实测100条一页约11,688ms，四路并发仍需要数分钟。API内容请求等待35秒后超时，前端代理限制30秒。
- 定期完整读取和快照仅允许额外30秒过期读取，使上游慢读直接影响前台可用性。进程 Running 不等于业务查询健康。

## 已授权恢复

用户弹窗选择“先恢复数据库查询，再优化云端查询”。

- 定向修改 `C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml` 中单个环境项：`PUBLIC_OPINION_DATA_READ_BACKEND=baas` → `mysql`。
- 配置修改前在同目录保留时间戳备份；只重启 `PublicOpinionApi`。现役代码包路径保持原值。
- 未修改采集窗口、运行任务、AI分析、鉴权、云端同步计划；没有执行数据回填、删除、Git提交或推送。
- `PublicOpinion BaaS New Content Sync` 计划仍启用；其他服务仍 Running。

## 验证

- HTTPS正式API携带现有授权进行只读请求：帖子列表200/434ms，共10条；评论列表200/434ms，共68条；统计200/272ms，post=10/comment=68/attention=1/negative=0/urgent=0。
- 浏览器 `club-opinion.q1.com` 的 Last Light 今日页面真实渲染帖子10、评论68、关注1、紧急0；切换评论后显示68条、分页50条；控制台无error/warn。
- 评论详情成功加载评论、原帖上下文、翻译和分析原因，并验证关闭按钮正常。截图保存于 `.tests/2026-10/2026-10-15/hosted-query-recovery-browser.png`。
- 本次自检浏览器访问 `lfy3001.dev.q1op.com` 报 `ERR_BLOCKED_BY_CLIENT`，托管页认证配置被浏览器拦截。正式域名命令行访问正常，但不能据此宣称托管入口浏览器验收通过。没有修改或绕过浏览器安全策略。

## 云端查询优化边界（未实施）

现有BaaS文档的查询字段嵌套于content。只读探测使用 `content.community_id` 和 `data.content.community_id` 都未返回预期数据；顶层 `schemaVersion=1` 正常返回10,049条，不能把不支持的筛选当作成功空列表。

后续需要可查询的顶层社区、平台、类型、发布时间字段或独立查询投影，并同时更新同步写入、存量索引及读取契约。先验证完整性、计数、评论原帖关联、ACL与冷启动时间，才能考虑切回。此记录只确认数据库查询恢复，不宣称云端优化已完成。

保持数据库作为现役查询源；禁止仅凭端口或单次健康200恢复原全量云端读取配置。发版验收必须包含有授权的真实内容/统计查询及浏览器加载。
