# 国内当天全分区与评论回复独立候选

Status: candidate / 未放行 / 不影响首页v8续采。

## 目标与边界

国内source/account/community101/board2固定，窗口仍UTC10/8 16→10/9 04:31:29.177。首页v8运行闭包111文件全部不改，经理串行继续原cp。新增模块逐目标执行非首页feed或某帖评论/回复，复用现役认证与持久cp，无shared Worker/调度/算法变更，无海外任务恢复，无DDL。

## 新文件与逻辑

- `worker/src/domesticTodayFeedRecovery.js`：从discoverFeeds发现board2完整描述，显式feedKey选择info/activity，不用首页默认入口；无时间推断早停，完整详情+幂等入库+AI后推进独立cp。
- `worker/src/domesticTodayCommentRecovery.js`：保raw/原时间/root/parent/depth，空当天页的replyTargets也先持久化；旧祖先仅上下文，不算当天数量/AI。
- `worker/src/domesticTodayGraphRepository.js`：新评论legacy事务，真实父子读回，拒ID类型/归属冲突、缺父链；reply目标同页事务创建独立checkpoint，无新表。首页post adapter不用于评论。
- `scripts/domestic-today-graph-recovery.js`：新实际依赖manifest，明确单feed/单post/单reply，严格TLS和目标DB，限页和独立进程。
- `worker/test/domesticTodayGraphRecovery.test.js`：多分区、旧父当天reply、空页目标、超过20嵌套、重复ID。

## 待验证与未完成项

语法检查通过；新增测试5/5通过，已消息流转独立QA，优先仅116已存当天post中的一个明确postId评论单页，不等全分区全集。新候选plan在仓库根`.temp/domestic-today-recovery-20261009/graph-plan-v3.unapproved.json`，新115依赖闭包；旧graph/v2不执行。尚未真实parser/HTTP/DB，不可执行候选；尤其评论INSERT占位符/事务列、父链上下文、reply目标durable需独立QA及经理只读parser核。

新增校验comment URL/root、纯媒体opaque无body，release状态/lease读回；只当天内容+必要祖先/replyTargets上下文，不泛回补整页旧评论。必要祖先原时间且不计today/AI。

独立QA已确认外部后台today116、原漏ID可见；这证明无数据故障恢复，但不等于评论/全部feeds/长效调度完成。现役schedulerMode默认off，runOnce若off会走listDueSources；进程实际继承mode待核，不能仅nextUTC06证明自动入队。

评论v3经独立QA条件GO/115闭包核验/经理MariaDB EXPLAIN INSERT21/21后，926761真实单页新增2内容、AI入队2，status COMPLETED_COMMENT_TASK_AI_QUEUED、replyTargets空，已流转独立raw/父链/UTC验收。证据根`.temp/domestic-today-recovery-20261009/graph-v3-comments-926761-page1-execution.json`。代码冻结不改；续采仅116当天帖中有评论显式postIds，已知926763、926748、926760、926762，经理同合同单post/maxPages1/newoutput串行，不扫描不必要旧帖。评论全集/AI分析/自动调度仍未完成。

独立QA v044真实首段PASS：2/2内容/raw/父子/原时间/AI指纹一致，精确ISO窗口cp completed/items2/leasefree；`.tests/2026-10/2026-10-09/v044_domestic_today_comment_926761_live_qa.md`。已再次消息回报经理同冻结合同显式today目标续采，后续缺陷退开发，首页116外部UI已可见；其余feed/comment全集及自动14点真实run验收未完。

长效新增只读证据：`C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml`明确UNIFIED_SOURCE_SCHEDULER_MODE=enabled、WORKER_MODE=enabled，env文件未见mode不能推断off。代码main→buildDeps→runOnce→unified seam接线存在；仍需进程实际env及14slot真实run/request/store证据，不用next_scheduled_at当执行PASS，不擅改频率/shared运行。

全部父帖覆盖还未证明：必须包括全部feed观察的post IDs和既有国内库授权父帖，不能只当天新post。全feed inventory终态、所有comment/reply checkpoint终态才可声称截至capture覆盖；本候选逐目标成功不等全集。

## 长效线索

经理现场：PID19584运行v055-formal1 worker.js无CLI参数；heartbeat UTC04:53:39 completed。国内schedule lastUTC00 nextUTC06（上海14:00），lease过期，run688窗到UTC00:00:33。此前早班窗不覆盖10:56之后发布帖子已证实，未证实14点调度故障。安全白名单env读取未见scheduler mode/recovery source/allowlist键，进程继承环境仍待核，不能据此断言disabled。首页累计116新增，第7页无窗内但hasMore；按20页预算partial保cp，不靠排序前缀宣称完整，不无限旧历史扫描。
