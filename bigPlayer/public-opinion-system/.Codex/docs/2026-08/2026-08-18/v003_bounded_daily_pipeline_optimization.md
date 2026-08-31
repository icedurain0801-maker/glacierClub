# Bounded Daily 流水线并发优化

日期：2026-08-18
项目：`public-opinion-system`

## 背景

前一版本已为 `upsertContentPage` 增加整事务死锁/锁等待重试，但真实并发写同一 `sync run` 仍会在 `po_sync_run_contents` 与共享 `po_sync_runs` 行形成结构性锁循环，因此 feed 写并发回退为 1。最近一次 daily 在评论阶段达到 1 小时边界并以 `partial/PARTIAL_SYNC` 退出。

## 本次改动

### 采集流水线

- 把分页采集拆成单页原语：网络抓取、响应校验和标准化在事务外执行，checkpoint cursor 只在页面事务成功后推进。
- 为每个 `sync run` 增加 FIFO 提交队列；同一 run 的 `upsertContentPage` 活跃事务固定为 1，失败操作不会污染后续队列。
- bounded daily 的 Q1 feed、comment、reply 使用独立请求并发（默认均为 4），但共享同一串行提交队列。
- 同一任务的第 N+1 页必须等待第 N 页提交成功。
- feed 页提交后立即开放其当日变更帖子的评论任务；comment 页提交后立即开放回复任务。
- daily 不读取历史父帖补偿；普通/常驻 worker 继续使用原有 `SYNC_*` 路径。
- deadline 后返回的迟到页面不会提交；成功或失败结束前都会 drain 并 close 提交队列。

### 分析流水线

- daily 采集只为已提交且位于前一北京时间自然日窗口内的变更内容入队 light job，不在采集回调中 claim 或调用 AI。
- daily runner 在采集开始前启动一个本地 scoped analysis pump，与采集并行。
- enqueue、count、claim 均携带准确的 `publishedFrom` / `publishedTo`，且 `force=false`。
- 采集成功后，pump drain 当日窗口内的 active light/deep jobs；采集 partial/failed 后停止新 claim，但允许已认领批次完成。
- partial 结果保留真实完成的 analyzed/alerted 计数，不再重置为 0。

### 可观测性

- phase 变化及每分钟输出脱敏 `daily_progress` JSON。
- phase 固定为 `preflight`、`collecting`、`draining_commits`、`draining_analysis`、`completed`。
- 输出业务日期、elapsed/remaining、来源计数、采集计数和分析计数；不输出正文、原始载荷、Token、Cookie 或 Authorization。
- 保留 15 分钟无可观察进度告警。

## 配置

新增 daily-only provider 请求并发：

```env
DAILY_FEED_FETCH_CONCURRENCY=4
DAILY_COMMENT_FETCH_CONCURRENCY=4
DAILY_REPLY_FETCH_CONCURRENCY=4
```

这些配置不控制数据库写并发；同一 sync run 的 commit concurrency 固定为 1，不提供可调开关。

## 正确性边界

- 未修改 connector 协议、数据库结构或迁移。
- 保留账号/来源身份校验、checkpoint lease fencing、`upsertContentPage` 幂等和事务计数。
- 不启动常驻 worker/global analysisWorker，不执行无范围历史补偿，不使用 `force=true`。
- 任一已授权来源未完成时，daily 仍返回 `collection_failed` 并以非零状态退出。

## 测试与验证

新增回归覆盖：

- commit lane FIFO、最大活跃事务为 1、失败不毒化后续提交。
- feed 请求并发但页面事务串行。
- 页间提交顺序、deadline 迟到页面、失败 cursor 保持。
- 多页 feed 不误判 partial，page budget 后从已提交 cursor 续跑。
- feed → comment、comment → reply 的即时调度。
- daily 采集只入队、不 claim/AI。
- scoped pump 的成功 drain、partial stop、窗口范围和进度脱敏。
- 普通 worker 的旧并发与分析行为保持不变。

自动化与真实 daily 运行结果在本次实现完成后的最终报告中记录；失败会保留实际错误和退出码，不伪造成功。
