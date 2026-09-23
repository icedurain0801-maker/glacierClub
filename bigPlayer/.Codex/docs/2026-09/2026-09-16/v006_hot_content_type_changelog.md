# v006 负面热帖类型标签与概览标题

日期：2026-09-16
Status: ui_and_worker_pass_external_pagination_blocked

- 用户已拍板：热帖固定负面标签改为实际帖子/动态/评论，原样式、排序、标题摘要及入口均不动；模块中文标题仅改为概览，保留KEY METRICS。
- 仓储列表生成display_type，概览白名单增加同一字段，不输出raw_payload；BigPlayer仅读取原始JSON顶层type，0帖子、1动态；评论优先统一评论，其他平台沿用存储类型。缺失/非法原始type保持post，不按标题或嵌套type猜测。
- 内容管理展示复用display_type，移除原有标题猜测；不改变存储content_type或查询集合。
- 新增定向类型测试；必要开发自测后直接交独立浏览器验收，不单独审查、不push、不发版。
- 当前单覆盖更新：内容与议题改为负面内容/关注级内容并列列表，移除议题分布与聚类说明及取数；两列Top10复用互动量排序、类型标签与查看交互，右列severity=attention无额外情感限制，全部内容分别携对应模式和共享精确范围。加载/空态/Scope刷新同步覆盖两列。
- 第一轮真实浏览器发现运行时仍拼接时间+概览，已修正为固定概览；旧布局类型核对Top10真实记录一致，自测1/1通过。新两列覆盖布局待重新验收。
- 新双列真实浏览器开发自测1/1通过，两列20条真实记录标签与内容API一致，两个深链包含对应模式/Scope/精确范围，标题固定概览，无议题DOM和说明，Console零error/warn。独立测试确认主体通过，但真实BigPlayer两类样本覆盖缺失，不是全项PASS。
- 最终后端407/407通过；旧topicDistribution断言按已拍板删除更新为新关注级窗口断言，语法与diff检查通过。
- 按PM补件只读查询：现有4564条BigPlayer顶层post记录的raw_payload顶层type全部缺失；可确认type1有标题0条、type0无标题0条，两类可进入负面/关注Top10均0。当前q1SafeRawPost白名单已包含type，不能归因为当前白名单遗漏；历史采集/运行进程版本或源响应缺失原因待确认。脚本v147_real_type_samples.js不读取或回显凭据、不写真实库。
- 已知918490在库，但无标题/raw.type缺失/未分析，不满足所需样本。已回报PM和测试负责人，等待后续数据映射或采集授权；不Mock、不造数据、不关闭、不push、不发版。
- 真实只读诊断确认：源merged-list/详情均返回number类型0/1，connector安全rawPayload保留type，Worker normalizePlatformItem固定rawPayload:null为首次丢失点。调度任务BigPlayer Q1 Daily 02指向当前仓库q1-daily.cmd，当前无常驻Worker；本次只启动指定源受控补取的一次性进程。
- PM已确认根因并授权实施：Worker仅BigPlayer posts透传白名单原始type0/1，其他平台和评论保持null；新增Worker贯通测试及仓储写参数JSON断言。补取按既有近一周、稳定源ID正常链路执行，需记录前后数量与重复证据。
- 受控run97c8f89b-36e5-456b-8f88-73646c28fa58已结束，未重复启动；窗口UTC2026-09-09T09:12:21.045Z至2026-09-16T09:12:21.045Z，source5c21f78d-5f67-4467-963d-dcdeb5e26cab。before总数9755/posts2815/with_type0/重复组0；after总数9888/posts2823/with_type1189/重复组0。run fetched1189/stored3720/inserted posts8，因180秒上限为partial/PARTIAL_SYNC，不宣称近一周完整覆盖。
- 真实样本已交测：916380/internal c51a8a37-a6f6-4228-8d96-f244f067f727为type1动态+attention；916433/internal970bb303-b51c-4929-8e97-a5649cb8bf6c为type0帖子+attention，同domestic/community00000000-0000-0000-0000-000000000101，单秒窗口可进入关注级Top10。交叉标题样本仍无，不改写真实标题。
- 正常频率入口缺口已报PM：任务BigPlayer Q1 Daily 02按次启动当前q1DailyJob，但统一调度enabled时跳过；未发现常驻Worker/统一调度服务或计划任务，故不能证明正常频率已执行。本次Worker SHA256 0FD4C631FF8259CBD3DAD216C4256F9F95B07C5DC39DA1D2C8435A3E14D6E7A6；不擅自启动扫描其他源的全局进程。
- 类型与仓储定向120/120通过。Worker全量214/215，唯一未改动调度器断言LEASE_FAILED/null与ENQUEUE_FAILED/6不一致，已按PM要求列为非本单既存风险，不扩修。
- 独立P0复测发现内容管理post模式走listContentTree漏display_type，已让树列表复用contentDisplayType；API刷新后真实916380 UI显示动态，开发浏览器1/1通过，已重新交测。
- 原任务第二段沿相同检查点/窗口续跑，after总数9888/with_type1189/重复组0，仍partial（feed provider分页预算耗尽）。第三段仅本次操作有限增加feed预算300页，每段180秒，已完成窗口检查点不重抓，未完成沿原游标；未扩改正常配置或其他源。
- 已授权恢复单一常驻Worker：显式enabled、当前worker/src/worker.js、60秒扫描，PID25096；此前缺少模式退出的进程未存活，无重复常驻实例。正常到期已存在槽位去重、不另造历史槽位；窗口完整结果与独立验收仍待确认。
- 第三段最终22个feed完成、2个feed未完（活动48:49及48:48），累计199页触及provider_offset_ceiling；after总数9888/posts2823/with_type1189/重复组0。按PM拍板停止无效续跑，近周补取保持partial、外部能力阻塞，后续单独协调源站分页/时间切片，不绕过偏移上限。
- UI验收口径已由PM校正：真实916380/916433覆盖type1/type0，交叉标题不存在则使用定向测试证明顶层type与标题无关，不继续寻找或造数据；UI与补取/频率P0分别收口。
- 为实际频率证据增加无敏感字段的scan_started/scan_completed日志，安全停止旧唯一PID25096后刷新为PID29604。当前代码SHA256 061DCAC8323079685ACB121149AC24CFC90C209EBBE8E6B563C1FDC45FDB0A44；日志确认enabled、60000ms、UTC09:23:24.989首轮scan_started，完成证据待补。类型/续跑/仓储定向122/122通过，语法/diff通过。
- v147 UI已由测试负责人最终PASS，按PM结单通知停止UI修改；真实916380两页动态、916433帖子，交叉标题以定向测试证明不读标题。
- 唯一常驻Worker运行证据：UTC09:23:24.989 scan_started，09:24:54.110 scan_completed（queued0/manual0/scanned0），09:24:54.111下一轮scan_started；60000ms定时触发、inflight串行执行避免重入，耗时超过周期则排队，不宣称每60秒均能完成。无新到期来源时不重复创建已有槽位。绝对日志路径：C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/v147-unified-worker.stdout.log，已交测试负责人独立复核。
- QA独立频率验收退回积压触发导致扫描完成后立即补跑；新增scanRunner单飞保护，运行中触发复用当前Promise、不排队，完成后等待后续定时触发；正常到期源频率仍由统一scheduler决定。两项定向测试通过。
- 常驻Worker入口强制NODE_TLS_REJECT_UNAUTHORIZED=1，不修改.env或其他服务；真实BigPlayer源读取在开启证书校验下成功，无TLS关闭警告。诊断脚本补齐platform参数，避免修复后只读追踪漏传平台造成误判。
- 最终独立频率/TLS复验PASS：唯一PID9600存活，旧29604/25096不存在，SHA256 EEE764B3A948DF007332507E9F4AFB2D616EE7C7D34FBE7C505A80082D5B2C83。UTC09:27:47.151与09:29:47.171两次scan_started间隔约120秒，符合60秒整数倍；09:29:23完成后未立即补扫，v2.stderr为空无TLS关闭警告。保持实例常驻，不重跑历史补取。
- 收口范围：UI v147 PASS、Worker频率/TLS PASS；近七天补取22feed完成/2feed外部分页边界未完，保持外部阻塞，需另行协调源站分页/时间切片能力，不称完整、不绕过边界。
