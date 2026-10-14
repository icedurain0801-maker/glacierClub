# 境内今日数据核对与六小时窗口修复

Status: 已发布，窗口测试与相同 URL 外网页面验收通过

用户截图为境内 / 超能世界国服版 / BigPlayer社区，communityId=00000000-0000-0000-0000-000000000101。此前海外社区验收不能证明这个社区当天存在内容，本次纠正验收范围。

北京时间2026-10-12 09:40复核现有来源的24个帖子入口，各请求code=0，返回中当天帖子数均为0；最新帖子时间为北京时间2026-10-11 18:27:01。另读取最新20篇帖子的评论首页样本，未发现当天评论。评论验证是样本，不表述为全社区评论穷举。数据库当天帖子、评论均为0。外网同截图完整日期URL复现，概览HTTP200、日期边界正确、显示0、页面无脚本错误；当前0不能通过修改计数伪造为非零。

旧现役Worker的02:00窗口只含昨日，其他时点回看7天。修改worker/src/sourceScheduler.js的boundedWindowFor：BigPlayer定时及补跑统一使用本次扫描日期对应的昨日北京时间00:00至扫描实际时间；保持02:00/08:00/14:00/20:00六小时槽、鉴权、来源租约、去重与其他平台规则。

工作区修改worker/src/sourceScheduler.js、worker/test/sourceScheduler.test.js，保留已有其他修改。发布基于当时现役worker-release-20261012-progressive-risk-v157-r3复制，仅替换boundedWindowFor函数，运行包相比当时现役仅worker/src/sourceScheduler.js改变。版本目录C:/ProgramData/PublicOpinion/releases/worker-release-20261012-domestic-six-hour-window-r1。

52项测试通过：sourceScheduler 22、sourceSchedulerRuntime 4、schedulerRepositoryAdapter 17、scheduleSlots 9；语法与git diff --check通过。发布包使用自身模块模拟四时点调度并校验窗口，通过。

通用运行包校验因现役继承的migrations/032_progressive_risk_severity.sql不在脚本允许目录而拒绝。后续使用完整文件集与现役逐字节比较，确认只有上述调度函数文件改变，保留该SQL而不执行迁移，更新409项文件哈希。现役aiAnalyzer.js与其旧manifest哈希已不一致，本次保留现役实际字节并记录该基线差异，不更改分析代码。

切换前确认活跃采集租约为0，备份Worker XML后短暂重启PublicOpinionWorker，状态Running，实际扫描完成且无新任务。API、前端不重启。海外guard的五个排除文件哈希与新包一致，只更新releaseRoot并重算guard哈希，独立海外入口preflight通过，未提交额外真实同步或执行数据库迁移。14:00未来触发尚未发生，不能将配置测试表述为未来真实采集已通过。

验收资料：.tests/2026-10/2026-10-12/domestic-upstream-verification.json、domestic-today-browser.json及截图。截图显示0是当前来源接口结果，非“已经补出今日数据”。
