# 海外父链与本地审查修正

Status: candidate / no-production-run / pending-independent-QA

海外评论窗口保留窗外顶层父评论上下文，worker 不把上下文计入本窗内容和 AI/翻译。海外入库排序先父后子，缺 root/parent 失败关闭；国内排序和过滤不变。

本地只读子代理审查后修正 session game/community/account 身份、安全异常、history adapter 缺失前置、历史分页 gap 校验、截止后收口检查、run/raw board 冲突与旧 schema 历史枚举（不引用不存在的 run board 列）。尚未完成真实旧 schema 入库适配，候选不得部署。

第二源自身当前 Token 只读 GET user/context 于 UTC 2026-10-09T06:28:59.666Z 返回 401。未改授权或数据，不能由此确定 board 或称社区无权。完整源及第二源仍按需求分别验收。
