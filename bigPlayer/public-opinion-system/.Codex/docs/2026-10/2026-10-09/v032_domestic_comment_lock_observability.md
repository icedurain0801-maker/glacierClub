# 国内评论926802锁超时与诊断增量

Status: 诊断候选待QA，926803未放行。

926802原graph v3单页ER_LOCK_WAIT_TIMEOUT；经理与QA只读后验目标窗内评论0，原ISO窗口cp idle/items0/cursorNULL/leasefree，当前waits空、两事务锁0。无法认定具体阻塞者或root/AI根因。

经理在QA仅一次重试条件下，同原cp、新output重试成功新增1评论/AI1，replyTargets空，仍待独立后验。旧失败报告保留，无reset/delete/shared/算法变更。

按经理“先可观测最小修复”要求，仅新增固定phase/storePhase/operation诊断至domesticTodayCommentRecovery.js、domesticTodayGraphRepository.js、scripts/domestic-today-graph-recovery.js；不输出SQL、参数、正文或凭据，不改变锁顺序/SQL/超时/事务/算法。新测试5/5通过，实际115依赖闭包重新构建graph-plan-v4-observable.unapproved.json。

交叉时序已消息说明：926802旧v3重试成功不能代表当前工作树仍旧v3指纹；后续旧manifest禁止盲跑。新诊断候选明确post926803/maxPages1/newoutput，须独立QA增量放行，暂不可执行。锁逻辑不凭瞬时消失擅改，若再次超时记录白名单阶段并由经理捕获当时锁/事务证据。
