# 内容类型下拉新增评论

Status: released

用户要求：在抓取内容管理的“全部类型 / 帖子 / 动态”下拉新增“评论”。

修改 ../admin/PublicOpinion/assets/content.js：新增评论选项，并接入现有 contentType=comment 服务端查询、计数和分页，不把 comment 发给只支持 post/dynamic 的 bigPlayerContentKind API 参数。普通列表选择评论同步激活顶部评论卡片；选择帖子、动态或全部类型切回原帖子列表模式。负面、关注级及紧急模式选择评论仅设置 riskContentType=comment，保留风险条件。顶部评论卡片与下拉值同步，类型控件在 BigPlayer 的评论模式仍显示。切换类型重置第一页，日期、社区及其他搜索条件保留；刷新和 URL 恢复保持评论类型。

修改 ../admin/PublicOpinion/content.html 的静态脚本版本。未改 API、Worker、数据库，未登录、采集、重新分析或写业务数据。

候选浏览器验证通过：国内评论 303 条、分页与刷新保持评论；切换帖子为 6 条、动态为 142 条；顶部评论卡片同步下拉；负面评论 52 条且保留负面条件；截图 Last Light 社区 2026-10-06 至 2026-10-12 评论 126 条，日期范围保留。无脚本错误、无写请求。

发布前现役包已更新，因此最终 release-20261012-comment-kind-filter-r2 从当时最新 release-20261012-content-handling-r1-r3-refresh-frequency 继承，保留现有处置与刷新功能，仅改 content.js、content.html 和 manifest。35 文件 manifest 校验和逐文件哈希差异检查通过，Node 语法与 git diff --check 通过；仅短暂重启前端3001。旧包及服务 XML 原文保留于仓库根临时目录的 comment-kind-baseline.json，可回滚。

线上验证证据：.tests/2026-10/2026-10-12/comment-kind-live.json、comment-kind-candidate.json、comment-kind-live.png、comment-kind-browser.cjs。

首次线上验收发现新服务配置已切换，但 3001 仍被旧 release-20261012-content-handling-r1-r3 的孤立 node 进程占用，新子进程日志报 EADDRINUSE。不能用服务 Running 或 XML 路径判断发布成功。核对旧监听进程的精确命令行、父进程不存在和新包包含评论选项后清理并恢复服务；Stop-Process 曾返回内部异常，后续 taskkill 报进程不存在，最终以真实端口监听和外网资产再次核验。收尾时监听进程为 release-20261012-comment-kind-filter-r2-refresh-frequency，新包继承了本轮评论功能，外网返回的 content.js 已包含评论选项。未覆盖这一后续包。

边界：“全部类型”沿用当前普通帖子模式中帖子/动态合计的既有语义；在风险列表表示全部内容类型。帖子 ID 与关键词等额外条件继续同时生效，不因选择评论而清空。
