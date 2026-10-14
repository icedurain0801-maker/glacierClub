# 帖子/动态筛选改为服务端分页前过滤

Status: released

## 问题与原因

用户在国内超能世界国服版、发布时间 2026-10-11 至 2026-10-11、第一页 50 条时选择“帖子”，显示暂无匹配内容，但分页仍为 1/3 页、148 条。原前端从服务端取回当前页混合内容后，才在本页过滤 display_type，且请求不发送 bigPlayerContentKind；countContents 同样未应用类型条件。真实帖子位于混合排序的后续分页，所以第一页筛选为空。927402 为 type=0 的帖子，并非数据不存在。

此前验收仅逐页核对类型标签及后续页筛选，漏测从默认第一页直接切换“帖子”的用户操作；本次补齐该场景。

## 修改

- server/src/services/contentDisplayType.js：增加共享 bigPlayerContentKindPredicate，仅接受 post/dynamic；条件限制 BigPlayer、底层 post，并依据 raw_payload 顶层 type。type=1 为动态，其他值保持既有 post 兜底；不使用标题或正文块 type。
- server/src/db/repository.js：listContents、listContentTree、countContents 在查询、排序和 LIMIT/OFFSET 之前使用同一谓词；仅传类型时 count 仍保留 source join；非法类型返回 INVALID_INPUT。
- ../admin/PublicOpinion/assets/content.js：请求发送 bigPlayerContentKind，删除当前页本地过滤，列表使用服务端总数，评论模式隐藏并清空帖子/动态筛选，概览统计请求不带类型参数。
- ../admin/PublicOpinion/content.html：刷新静态脚本版本。
- server/test/repository.test.js：增加列表、树、总数谓词一致性、分页偏移、社区/日期/帖子 ID 条件保留、非法输入无查询和仅类型 count join 测试。

## 验证与发布

9 项分类和查询回归测试通过；Node 语法和 git diff --check 通过。候选版本只读查询真实数据，帖子 6 条第一页全部返回（含 927402）、动态 142 条、混合 148 条。

release-20261012-kind-pagination-r3 分别基于切换前现役 API 与前端 release-20261012-independent-alerts-r2-comment-original-r1，仅应用本轮定点修改，保留其他现役功能；API 396 文件、前端 33 文件 manifest 校验通过。API 变化为分类服务、repository、manifest；前端变化为 content.js、content.html、manifest。构建前后逐文件比较确认业务差异范围。首个候选 r1 遇混合换行补丁校验失败，未发布；r2 切换前现役已变化，拒绝切换；r3 重新基于最新包构建并发布。

仅短暂重启 API4320 与前端3001，不重启 Worker，不修改数据库、不提交或推送 Git、不发送站内信。保留旧包及服务 XML 快照用于回滚。

Edge 外网真实点击验收通过：默认混合 148 条；从第一页选择帖子返回 6 条、分页 1/1 且下一页禁用；在帖子筛选下搜索 927402 返回 1 条；清空 ID 返回 6 条；动态总数 142、两页无重复；从动态第二页切换帖子重置为第一页 6 条；全部类型恢复 148；评论 303 条且类型筛选隐藏。浏览器无脚本错误，无写请求。

证据：.tests/2026-10/2026-10-12/kind-pagination-live.json、kind-posts-first-page-live.png、kind-repository-readonly.json、kind-pagination-unit.txt。

顶部内容统计仍按社区和日期统计，不随列表的帖子/动态细分、关键词或帖子 ID 筛选改变；底层 content_type=post 代表帖子/动态合计。历史 raw_type_display_changelog.md 中“仅当前页筛选”的限制已由本次修复解除。
