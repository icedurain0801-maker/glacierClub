# v141 新建评论链与membership FK插入竞争交QA

Status: ISOLATED_COMMENT_CHAIN_MEMBERSHIP_PRIMITIVE_PASS

冻结 `.temp/overseas-qa-scheduled-stage-AeYqAH`，manifest SHA `262285c29d23a2d1019b2feba5ee9d2a224bbbcc2a775fd78b35165130dacd78`，692。开发前后verify实际输出 `.temp/AeYqAH-dev-preverify.raw.txt`、`AeYqAH-dev-postverify.raw.txt` SHA均 `667de346ba91f47f14d552399078731353c0064889f1f17f2fdd568ef18667f7`。

冻结新建链原件 `.temp/overseas-real-db-58cxGT/result.json` SHA `ca374f03e8786cfa94bd2f6be3259986ce892ef899e1a9878d9b5d9ab669e3d8`；membership锁原件 `.temp/overseas-real-db-OQMDph/result.json` SHA `3f1cf9dcc8b70782eefe3db946870dd97d209b3d1c53cf4e4a896aec93a4322b`，两mode exit0且owner停止释放。

员工只读复审通过可局部流转。链每站post/comment/reply各一、四任务sealed、六unique links；中间祖先删除事前拒绝，父相关五表零写。membership实际独立连接INSERT在content X锁持有时FK等待超时零插入，释放后成功。不是parent finalize barrier的membership竞争/零父写证明，也不是历史未link祖先parent完整链。当前historicalParentChainVerified/ancestorConcurrencyVerified=false；原语membershipConcurrencyScope明确限定。

独立QA仅前verify→`--isolated-parent-comment-chain`→`--isolated-ancestor-locks`→后verify，全部raw/hash，不重跑旧PASS充进度。cursor anchor/全失败/terminal全字段/translation预算漂移与生产持久/排空切换演练未完成；真实HTTP/AI/通知/恢复不运行。国内不动、不第二consumer、不重试受限proof，整体NO_GO/HOLD。

独立QA v143已接收，开发重算四原件hash与报告一致：前后verify `0be864f2bdd55660217b52a4408c2e332f5bc14f63bff4e1fbee8c33b0ce48d5`；v3KMs1/result `707f9d20209a2c403f59a33ec706244d050d500aaa3fb91f5d4008e34cb183a0`；LDPiPI/result `eaf0e44a3b5a3423dd040c0fc60d0bacbe7e78e7ffde671f8702c6a1cb235d85`。两owner停止释放，六links新建评论链与FK原语局部PASS。membershipConcurrencyVerified仅primitive_fk_insert_not_parent_finalize_barrier，历史链/祖先并发/真实运行仍未验证。
