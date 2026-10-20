# 社区加载性能优化

日期：2026-10-20。状态：r4 已切换现役，本轮 Chrome 回归通过；后台争用引起的偶发慢请求仍存在。

## 范围和授权

用户要求整体排查社区加载慢，并已批准现役 API 切换及继续 Chrome 验收，不推 Git、不发布静态托管。发现检查点汇总超时后，用户另行批准新增索引并验证。没有更改风险判定、处理状态或推送规则，没有触发采集或发送通知。

## 修改

- `server/src/db/repository.js`：有日期的简单维度计数由八次查询合并为一次分组，复杂筛选仍走原路径；聚合固定现有范围/发布时间索引及分析覆盖索引。
- 概览内部聚合串行执行，避免一次请求同时向共享连接池提交多个大范围扫描；概览预览省去不用的评论数和任务状态补查。
- 概览预览及有日期的帖子/评论列表先按原筛选和排序分页 ID，再关联正文、采集原始数据、AI JSON、翻译和评论数。详情及无日期等其他查询保持原路径。
- 同步检查点汇总使用已有覆盖索引；错误提示使用新增前缀索引，保持每个 scope 按原根内容 ID 和检查点 ID 选取首条非空错误的规则。
- `migrations/043_checkpoint_error_summary.sql`：新增 `po_checkpoint_error_summary_idx`，没有删除或修改业务数据。MariaDB 表含长 HASH 唯一键，使用 COPY/SHARED 构建，实际耗时 427414ms（约7分7秒）。为减少争用暂停 API、采集、分析及翻译服务，建索引后四项均已恢复 Running；043 已登记到迁移记录。证据 `checkpoint-index-deploy.json`。

## 验证与证据

工件均在 `.tests/2026-10/2026-10-20/`。

- `community-load-compare-original.json`：原版与 r1，在同一只读一致性快照下比较 39 个启用社区、59 组完整概览输出，全部一致。
- `community-load-compare-r3.json`：r2 与 r3，同样 59 组全部一致；r4 未再改概览输出。
- `management-query-compare.json`：r3 与 r4，超能/X-Clash 的帖子、评论、全部/关注/负面 12 组完整列表输出一致。
- `checkpoint-summary-compare.json`：12 个账号新旧同步摘要完整一致，新查询约6～268ms；此为仓储查询耗时，不是页面总耗时。
- `final-focused-tests.txt`、`candidate-r4-tests.txt`：19 项聚合、分页、风险约束、任务状态过滤及同步摘要测试通过。
- `final-overview-tests.txt`：4 项原有概览测试通过。
- 语法及指定文件空白检查通过；434 文件运行包 manifest 校验通过。
- 全仓储测试存在原有失败：本轮修改前后工作区均为 147 通过、13 失败，失败名称一致。不能把上述定向测试表述为全量测试通过。

## 浏览器验收过程

- r1：Chrome 复现 X-Clash 概览/趋势 30 秒 504，未判通过。
- r2：部分概览改善，但韩语社区一次 24 秒；超能仍出现 30 秒 504，未判通过。
- r3：17 个可见社区逐个完整导航并等待请求完成，近 7 天概览均返回 200，约 197～1555ms。证据 `browser-r3-batch1.json`、`browser-r3-batch2.json`。
- r3 扩展回归发现仍有问题：X-Clash 近 15 天概览 26704ms；昨日帖子列表 14781ms；抓取账号页 `/sources` 30 秒 504；任务列表自身返回 200，但其来源筛选接口同样超时。证据 `browser-r3-pages.json`。因此不能仅凭近 7 天社区验收宣布整体完成。
- r4 初次恢复服务后，X-Clash 15天概览仍出现过一次30秒504，当时有旧慢SQL继续执行；释放旧API请求后恢复，不能将这次失败省略。
- r4 最终逐页回归17个可见社区近7天概览：全部正常显示，所记录API均200；概览接口97～2193ms。证据 `browser-r4-final-batch1.json`～`browser-r4-final-batch3.json`。Last Light 来源摘要一次4751ms，说明其他接口仍会波动。
- r4 X-Clash近15天概览最终1641ms/200；昨日帖子50条首屏2697ms/200，评论50条首屏472ms/200，实际点击下一页849ms/200，页码和内容均更新。证据 `browser-r4-final-15d.json`、`browser-r4-final-pages.json`、`browser-r4-comment.json`、`browser-r4-pagination.json`；截图 `browser-r4-comment-page2.png`。概览评论页签也实际点击且未见页面加载错误，未记录到独立评论请求，不能据此声明其网络调用验收。
- r4 抓取账号页曾12739ms/200；其后三次完整重载988、180、212ms/200。任务记录来源225ms、任务列表294ms/200。证据 `browser-r4-final-pages.json`、`browser-r4-sources-repeat.json`。最终当前页面控制台0错误。

## 测量边界

原版→r1 单连接仓储概览中位数：超能 544→321ms、X-Clash 2031→1521ms、Last Light 108→65ms、マジックカード 950→284ms。这不是浏览器总耗时，也不能把受并发负载影响的一次 28.6 秒请求当成稳定基线来计算倍数。

后台另发现大范围采集目标扫描和 BaaS 同步扫描，存在数据库资源争用；本次没有擅自修改其业务范围或终止其他业务查询。对多用户并发及未来数据增长不作永不变慢的保证。

已定位的后续优化对象为 `worker/src/baasLiveWriter.js` 大批量ID扫描，以及 `worker/src/sharedOverseasCommentTargets.js` 历史评论目标扫描。本轮未改这些Worker业务查询。数据库缓存及系统内存配置未调整。

议题SQL曾尝试先分组数组再展开，单连接对比207→198ms，收益不足；r5实验已撤回且未发布。工作区其他未发布差异继续保留。

## 版本和回退

最小候选 `release-20261020-community-load-r4`，仅替换 repository；没有整包带入工作区其他未发布功能。API 旧版 XML 均在仓库根 `.temp/playwright-mcp-connect/` 保留。数据库索引回退应先恢复不依赖新索引的代码，再移除索引，不能在新代码运行时直接删除索引。

最终核实服务XML指向r4，repository SHA256为 `f10a81618fd346edab282da45ea5366d048885a011b994d34553f76c45d75435`；本机4320 `/health` 返回200，四项服务Running。语法及指定文件diff空白检查通过。定向列表/详情/概览另10项通过（`final-repository-focus.txt`）。本轮不推Git、不提交BaaS、不补发通知。
