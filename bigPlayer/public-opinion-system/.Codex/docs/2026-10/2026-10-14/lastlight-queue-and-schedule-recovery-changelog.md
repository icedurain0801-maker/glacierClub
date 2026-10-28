# Last Light 采集排队及进度恢复

日期：2026-10-14。状态：修复已启用，原7天采集任务继续执行，尚未验收全部内容完成。

## 原因

来源 `081a16d2-5545-4afd-9c65-e04777e4540b` 由专用采集器负责，通用 Worker 有意排除该来源。专用任务的共享排除校验仍绑定旧 Worker 运行包，Worker 发版后校验失败；混用路径斜杠也影响进程路径比对。页面创建的手动主任务及三个站点子任务停在 queued，没有交接给专用采集器。

进度接口只查询主任务的内容关联及计数，专用采集器将实际内容写到子任务，导致页面即使正在抓取仍显示0。

## 修改

- `worker/src/overseasQueuedManual.js`：严格接收同一来源/账号、无执行记录、无租约、无计数且窗口一致的手动主任务及三个子任务。保留运行ID和原时间范围。
- `worker/src/overseasProductionDaily.js`：增加手动排队交接与持久化恢复；启动时从实际 Worker XML 重绑已验证的排除清单；路径比对统一斜杠。保留单进程、文件哈希、来源锁、租约、证书及鉴权检查。
- `scripts/windows-services/source-check-runner.js`：将该来源的手动队列交给已安装的专用采集器。仅对有匹配持久化意图、因页数/请求预算结束的手动任务自动续跑，不自动重试鉴权、未知提交或人工暂停。
- `scripts/windows-services/sync-source-check-tasks.ps1`：为该来源检查任务增加每分钟触发；自动采集仍为6小时。
- `server/src/db/repository.js`：主任务实时汇总同账号子任务计数，帖子/评论按内容ID去重；内容列表读取主任务及其子任务关联，并保留原账号/来源/社区边界。使用先查运行ID再按关联索引查询，避免扫描整个内容关联表。
- 新测试：`worker/test/overseasQueuedManual.test.js`、`server/test/parentSyncRunProgress.test.js`。

## 启用与影响

专用采集运行包：`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-release-20261014-emotion-r2-queue-recovery-1791965497371`。复用已有语言解析器重试修复。

更新 `BigPlayer Last Night Overseas Daily 02` 的运行包；更新该来源 Source Check 触发器和运行脚本，保留原任务主体及6小时自动周期。通用 Worker 未重启、排除策略未取消。API 使用现役运行包副本，仅补丁修改读取逻辑，并短暂重启。运行包清单见同目录的 release-manifest 文件。

未删除采集任务或内容，未扩大来源/版块/窗口；没有重复启动通用采集器。

## 验证

- queued handoff、专用采集恢复、语言解析器隔离测试：16/16通过。
- 主任务进度、当前/旧表结构、读取路由兼容测试：7/7通过。
- 修改JS语法检查及限定路径空白检查通过。
- 专用运行包 preflight 通过，验证三个站点；预检没有网络请求或数据库写入。
- 原运行 `654fa8f2-5866-4fb5-80b0-79d47096101c` 已从 queued 进入 running；窗口仍为 `2026-10-07T07:42:47.742Z` 至 `2026-10-14T07:42:47.742Z`。
- 真实可见 Edge 访问已登录的 `https://club-opinion.q1.com/admin/PublicOpinion/sources.html`，未模拟接口。修复后帖子数量从95增加到123，评论从0增加到74；最终新增16、变更177、未变化4，实际内容列表出现；浏览器没有页面脚本异常。点击收起后进度面板成功关闭，后台任务仍运行。
- 证据：`.tests/2026-10/2026-10-14/lastlight-recovery-browser.json`、`lastlight-recovery-browser.png`、`lastlight-recovery-browser-final.json`、`lastlight-recovery-browser-final.png`。
- 15分钟终态观察到期时任务仍在抓取，未验收完成终态；后续改为验证真实进度增长及面板收起。现有 Edge 登录态访问 `lfy3001.dev.q1op.com` 会回到只读概览，所以上述操作验收使用已登录的正式后台域名；本机域名的采集管理登录验收未通过。

## 尚未完成的运行验收

7天采集任务仍在执行，全部站点及评论尚未完成，不宣称已采集完毕。此前00:00自动时间槽尚未确认成功；持久化状态保留，后续专用任务会按原调度恢复。正常运行时“同步中”表示仍有分页/评论任务，已提交的内容与数量会持续刷新。

## 后续用户调整：只补抓昨天

用户随后明确取消7天补抓，范围改为北京时间2026-10-13 00:00至2026-10-14 00:00。

- 经专用采集器 STOP 标志安全退出，确认来源锁及运行租约释放后，将原7天任务标记 cancelled。保留已抓取内容及运行关联，记录取消审计。
- 原手动意图重命名为 `superseded-manual-654fa8f2-5866-4fb5-80b0-79d47096101c.json`，不再被恢复扫描选中；没有删除文件或内容。
- 通用入队入口因 `UNIFIED_SCHEDULER_SCHEMA_NOT_READY` 拒绝创建，未修改表结构或关闭门禁。采用专用采集器已有持久化手动意图入口，仍执行原鉴权、配置摘要、站点范围、共享排除和租约准入。
- 新任务 `b3b281c9-4007-4eb7-a2ca-51be0daefe10` 已进入 running。只读核验主任务及三个子任务均为 UTC `2026-10-12 16:00:00.000` 至 `2026-10-13 16:00:00.000`，即昨天全天。
- 可见 Edge 自检确认新运行ID和同步中状态，面板收起成功，无页面脚本异常。证据：`.tests/2026-10/2026-10-14/lastlight-yesterday-browser.json`、`lastlight-yesterday-browser.png`。
- 正常6小时自动调度不变；新任务尚未验收采集完成。
