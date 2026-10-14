# v125 父任务 epoch1 隔离候选

Status: DEV_SQL_PASS_REVIEW_PENDING

新增 `server/src/db/overseasScheduledParentStore.js` 和 `scripts/overseas-isolated-parent-checks.js`；admission store 对原品牌 firstClaim context 增加全集 parentAggregateFence，仅已有同进程 epoch1。隔离 runner 新增 `--isolated-parent`，在正常 admit/journal 后分支进入；不经过第二站 ACK-unknown 分支，不创建恢复凭据。

可信读取由内部 ledger 和 audit 执行，不接受布尔验证/合成投影。全集 run 排序锁→source/state/identity→manifest/task→CP→links/content→audit；核原 live parent/state 精确 tuple。逐子终态 reconcile 接受后才能原子结束父任务、释放 state、更新 source、写确定性审计。全部成功才发布 fixture 专属成功窗口上界游标；不是裸 CP MAX(last_item_at)，也不是最新内容时间。非全成功只 partial，不推进成功游标。成功游标锁与严格递增检查避免回退。

夹具通过两个正常 firstClaim 获取品牌 proof，每站完成两项空 feed、history/expansion seal、绑定终态审计。计划 SQL：CP 快照漂移零写、写尾审计故障全回滚、并发 finalize 单赢家及父/state/source/cursor/event 原子效果。partial、cursor回退、COMMIT_UNKNOWN 矩阵尚未补齐。

语法检查已通过；目前尚未启动数据库验证，避让预算 QA 的 13316。没有将候选结果写为 PASS。需审查后执行自有隔离 SQL，冻结新闭包再交 QA。国内/现役不动、整体 NO_GO；四辅助及受限 proof 不修改/不放行。

## 开发执行补充

QA 回报预算运行已停止释放端口后，owner 核空闲并执行本候选两次。最终活动树原件：仓库根 `.temp/overseas-real-db-euVcMV/result.json`；8 项 parent 检查 PASS，包括原正常两站 proof、空feed sealed/audit、CP快照漂移零写、parent owner漂移零写、cursor不递增零写、写尾故障全回滚、并发 finalize 单赢家、原子效果。实例停止/端口释放 true。

此处覆盖上文执行前状态，保留其历史。partial/ACK未知矩阵未完成，非空内容场景未测，游标仅代表完整扫描窗口上界；新模块尚待员工只读审查和新冻结独立 QA，不将开发 PASS 标为运行 GO。

## 复审与补充矩阵

员工只读审查已完成，修正 CP 漂移测试为精确 `OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT`，事务显式 REPEATABLE READ。修正后成功矩阵原件 `.temp/overseas-real-db-gTzAjr/result.json`。

新增正常成功+partial 两站矩阵，partial 没有成功游标且 state 原子释放；仅 sealed 空 child 主动标 partial，不覆盖 unsealed/failed/manual 全矩阵。第一次夹具错误仍传 sourceStatus success，被 `OVERSEAS_AUDIT_TERMINAL_INVALID` 拒绝，原件 `.temp/overseas-real-db-W8HOWv/result.json` 保留；修正为 partial，未放宽业务校验，通过原件 `.temp/overseas-real-db-ohGzi5/result.json`。

新增父事务实际 COMMIT 后注入 ACK 丢失，得到 `OVERSEAS_PARENT_COMMIT_UNKNOWN` 无结果；DB 原子终态/cursor/event 已提交，原凭据再次 finalize 被 fence 拒绝，没有自动重放。通过原件 `.temp/overseas-real-db-qEACyp/result.json`。三次最终成功实例均停止并释放端口。

当前仅上述独立隔离矩阵 DEV_SQL_PASS。非空内容/membership/祖先并发证据、unsealed/failed/manual 全矩阵、后续 anchor 使用 certified cursor 尚未完成；不能称完整父终态或调度游标闭环。新冻结后独立 QA。
