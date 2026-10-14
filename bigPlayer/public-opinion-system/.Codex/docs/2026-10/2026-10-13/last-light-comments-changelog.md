# Last Light 评论与回复采集

Status: 已发布，真实补采验收通过

## 变更

- `worker/src/overseasDailyComments.js`：评论时间窗口筛选、父级上下文、楼中楼目标发现、分页及恢复；站点根帖子去重。
- `worker/src/overseasProductionDaily.js`：帖子完成后进入评论阶段，评论/回复任务写入原有receipt，内容、任务关联、分析/翻译和分页断点同事务提交；评论未完成则保持running/partial。
- 当前无版块独立列，评论原始数据增加`_overseasScope.boardId`，维持原父子范围验证。
- 顶层parentId=0归属根帖子；窗口外祖先只保存必要上下文，不计入任务、不触发分析/翻译。
- 续租心跳与页事务在同进程串行；页事务本身续租，避免自己的心跳等待页事务锁超时。
- 对已有版块标记缺失的历史根帖子，只在账号/游戏/社区/类型/深度正确且站点及版块membership精确匹配时补充范围元数据；冲突标记拒绝修复，正文与fingerprint保持原值。
- 评论写入计数纳入子任务，finish按实际去重内容关联校准父子任务统计，避免嵌入回复和独立回复分页重复计数；旧handoff基线保持原契约。
- 请求前仍逐次验证共享Worker排除、STOP、启用状态、源及子任务租约；Windows进程查询直接过滤服务子进程，去掉同一HTTP请求前重复的进程枚举。

## 发布

旧包：`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-release-20261013-language-context-r2`。

评论包：`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-release-20261013-comments-r6`。

仅叠加两个Worker文件和运行cmd（请求预算从240调整到原有硬上限1000）。manifest 407文件通过。定时任务`BigPlayer Last Night Overseas Daily 02`仅切换包路径，原触发、隐藏启动、principal和settings不变。共享Worker/API/前端不重启；没有数据库结构变更或删除。

回滚task XML：仓库根`.temp/last-light-comments-repair/task-before.xml`；当前任务XML同目录`task-after.xml`。

## 自测和真实验收

最终统一回归：原语言8项、调度/窗口/断点13项、评论新增10项、原评论连接器3项，合计34项全部通过。新增历史根缺标记测试同时验证membership缺失、冲突版块和错误账号均拒绝修复。测试输出：`.tests/2026-10/2026-10-13/last-light-comments-tests.txt`。语法、依赖闭包、manifest通过。

真实父任务：`663644d3-11fc-56d3-aaea-a7e2ff18645e`；窗口北京时间10/12 00:00至10/13 18:41:38。

真实验收过程发现无版块列的兼容标记遗漏导致首个评论页回滚，r2补齐；随后暴露页事务与本进程心跳锁竞争，r3串行化；r4补齐任务计数；r5在membership证据完整时兼容旧根帖子缺失版块标记；r6按去重关联校准包含重复出现回复的任务统计。一次使用已有STOP机制在页断点处暂停后切换r4，确认进程退出后移除本次标记，未留下STOP文件。均使用原有断点续采，未改旧已完成state、未手工伪造完成、未清理原数据。

最终父任务及三个子任务全部completed，error_code为空；去重关联196条内容（52条帖子/动态、144条评论），本轮新增144条评论，其中4条为楼中楼回复。英语98、日语4、韩语19个评论/回复目标全部完成。父子关联缺失0，窗口外任务关联0；分析队列和翻译队列均关联144条评论；父子任务计数与实际关联完全一致。

| 北京日期 | 英语评论 | 韩语评论 | 日语评论 | 总计 |
|---|---:|---:|---:|---:|
| 10/12 | 12 | 6 | 0 | 18 |
| 10/13（截止18:41:38） | 44 | 62 | 20 | 126 |
| 合计 | 56 | 68 | 20 | 144 |

日语10/12为该时间窗口和当前站点绑定根范围内的接口遍历结果，不推断整个社区全部历史在该日没有评论。

验收脚本退出0；结果明细：`.tests/2026-10/2026-10-13/last-light-comments-acceptance.json`，主执行结果：`last-light-comments-backfill-result.json`。实际执行最终使用r6。服务健康检查API、共享Worker、前端3001均Running；任务action为r6，原触发器与设置不变，STOP不存在。没有Git提交或推送。

## 范围说明

评论根候选来自配置站点绑定的feed memberships，包括窗口以前的已绑定帖子。没有站点身份的旧历史记录不猜测语种。本次未实施更早日期的完整历史回溯；旧祖先作为必要上下文保存。本进程只创建分析/翻译任务，不直接调用AI。
