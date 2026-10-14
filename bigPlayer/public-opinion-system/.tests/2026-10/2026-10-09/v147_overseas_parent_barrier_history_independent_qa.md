# v146 父收尾 membership barrier 与历史祖先链独立 QA

Status: `ISOLATED_PARENT_BARRIER_HISTORY_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围

只对冻结根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-QY5kRj` 执行前 verify、新建评论链、历史祖先链、后 verify。manifest SHA256 为 `4a14a97da1eedc43b0456a34a535ec59468bb7e560d3d98ffeda6be7698f250b`，692 文件。未运行旧矩阵、生产/3306、真实 HTTP/AI/通知、恢复 proof 或第二 consumer；国内现役不动。

## 独立原件

| 阶段 | 运行时 raw / result | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.temp/QY5kRj-qa-preverify.raw.txt` | `667de346ba91f47f14d552399078731353c0064889f1f17f2fdd568ef18667f7` | `verified=true, files=692`，exit 0 |
| 新建链 stdout | `.temp/QY5kRj-qa-comment-chain.raw.txt` | `755e13f21b676bd80019d5683cd75467fca1b4fe6d2d06c5fde285d6a20f806e` | exit 0 |
| 新建链结果 | `.temp/overseas-real-db-5wHrRE/result.json` | `2144ac49487a34b4ac616be302d0f6ce7e5e26b0d3d7aa3778b7c2b9a5e6088f` | `PASS_ISOLATED_PARENT_COMMENT_REPLY_CHAIN` |
| 历史链 stdout | `.temp/QY5kRj-qa-historical-chain.raw.txt` | `9ac1cf3a5cebf57d8571d9aa80cd2f1f727222b4f618206e406084c7317096d5` | exit 0 |
| 历史链结果 | `.temp/overseas-real-db-B5yczp/result.json` | `3520e143f7e0237b2f9728df8db802ba6dfdccb55da68d82b14a1b87bd7e96d9` | `PASS_ISOLATED_PARENT_HISTORICAL_COMMENT_REPLY_CHAIN` |
| 后 verify | `.temp/QY5kRj-qa-postverify.raw.txt` | `667de346ba91f47f14d552399078731353c0064889f1f17f2fdd568ef18667f7` | `verified=true, files=692`，exit 0 |

raw 在各命令运行时由 `Tee-Object` 采集；命令 exit 0 由终端返回确认，exit code 未写入 raw 文件。两个自有 13316/serverId 20261036 实例结果均 `serverStopped=true`、`portReleased=true`、`productionTouched=false`，结束后 13316 无监听；现有 3306 PID 5900 未作为测试目标。

## 验收结果

- 新建链：两站各 post/comment/reply 一条，六个 unique links，各站四个 completed tasks；父 `discovered=6/stored=6`，成功窗口 cursor 发布。实际 parent finalize 完成全部排序祖先 current 锁后，独立 writer FK INSERT 收到 `ER_LOCK_WAIT_TIMEOUT`；插入前、writer 事务内超时后、回滚后均为 0，父锁释放后为 1 并清理合成 membership。
- 该竞争用 fixture sentinel 触发正常事务回滚，父相关五表保持不变。这是锁 barrier 和回滚原子性的证据，**不是业务逻辑自行检测 membership 插入并拒绝 finalize**。
- 历史链：四条预存祖先（两站各 root/comment）不变，root 有合成旧 run 站点关联，但不是认证历史成功证明；历史 comment 全库无 link。当前两个 child 各仅新增一条 depth2 reply，父 `discovered=2/stored=2`，当前 batch 两个 unique links。删除历史中间祖先的事前反例拒绝且父五表零写。
- `overseasScheduledParentStore.js` 与 `overseas-isolated-parent-checks.js` 静态语法检查通过；结果分别标记 `membershipConcurrencyScope=actual_parent_finalize_content_fk_insert_barrier` 与 `historicalParentChainVerified=true`，但历史场景 `ancestorConcurrencyVerified=false`。

## 未覆盖与结论

历史祖先 UPDATE 并发、历史成功批次认证、下一槽读取认证 cursor、完整 terminal 字段矩阵、translation 预算、真实 HTTP/AI/通知、恢复/epoch2 和切换排空均未验证。四辅助仍不放行。此批仅为 `ISOLATED_PARENT_BARRIER_HISTORY_PASS`；生产保持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
