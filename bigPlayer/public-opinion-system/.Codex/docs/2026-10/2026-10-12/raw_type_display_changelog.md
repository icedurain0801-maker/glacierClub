# 恢复上游帖子/动态类型规则

Status: released

用户纠正最终口径：BigPlayer 顶层 type=0 为帖子，type=1 为动态。标题不得决定类型，正文富文本块中的 type 不属于内容类型。撤回上一轮 title_display_changelog.md 的标题分类改动。

修改 server/src/services/contentDisplayType.js，恢复读取 raw_payload 顶层 type，兼容 JSON 字符串和数字/字符串 0/1；评论/review 优先归为评论；其他平台保持既有类型。缺失、损坏的 raw payload 保留既有 post 兜底，不推断嵌套字段。更新分类与概览测试：3 项分类测试覆盖标题有无与类型冲突，4 项概览回归通过；语法和空白检查通过。

用户最初指定 927488，数据库及本机/外网 API 均未找到，上游详情 HTTP400。用户随后更正为 927402。只读核验 927402 的上游详情 type=0、存储 raw_payload.type=0、API display_type=post；Edge 外网真实页面显示“帖子”，详情标题“药剂鬼才与吟游诗人”保留。未复现此前“动态”标签状态，旧误标原因尚不能确定，不把缓存或采集错误作为事实。

最终包 release-20261012-raw-type-display-r2 基于切换前最新现役 release-20261012-title-display-r1-trend-total-r1，仅分类函数及 manifest 变化，396 文件完整校验通过。仅切换并重启 API4320，前端、Worker、数据库未变；未重新采集、登录或写业务数据。上游核查使用现有 Token，只读取一个帖子详情。

收尾核对时现役包已更新为 release-20261012-metric-breakdown-r2；已只读核对其 contentDisplayType.js 与本次工作区规则一致，type=0/1 修正被保留，服务 Running。未覆盖该后续包。

第一轮切换因现役包已增加 trend-total-r1 后缀，字符串前缀替换生成不存在的目录，服务启动失败；自动回滚后服务恢复。第二轮基于最新包复制，完整解析 arguments 和 workingdirectory，以 XML 字段设置完整路径，并在切换前逐字比较 XML；成功运行。保留旧包及服务 XML 备份。

证据位于 .tests/2026-10/2026-10-12/post-927402-live.json、post-927402-list-live.png、post-927402-detail-live.png、raw-types-live.json。帖子/动态下拉仍沿用当前页过滤，本轮未扩展为全量分页前筛选。
