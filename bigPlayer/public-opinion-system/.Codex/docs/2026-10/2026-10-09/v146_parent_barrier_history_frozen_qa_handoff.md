# v146 父收尾 membership barrier 与历史祖先链交 QA

Status: ISOLATED_PARENT_BARRIER_HISTORY_PASS

冻结位于仓库根 `.temp/overseas-qa-scheduled-stage-QY5kRj`，692 files，manifest SHA256 `4a14a97da1eedc43b0456a34a535ec59468bb7e560d3d98ffeda6be7698f250b`。开发前后 verify 实际 raw `.temp/QY5kRj-dev-preverify.raw.txt` / postverify，SHA均 `667de346ba91f47f14d552399078731353c0064889f1f17f2fdd568ef18667f7`。

冻结开发原件：`.temp/overseas-real-db-XHVyYv/result.json` SHA `3e2226acf6143963577e9d0b18540e7b01211d1fc249682257976bf6a475cd5e`；`.temp/overseas-real-db-LR1LIL/result.json` SHA `a1a5caa8e2b9a1c8ccc9a55dc0ba4d5490a8b4bf50b904428d9bb093134d9faf`。两个 mode exit0、owner停止释放。员工只读复审无阻断，建议补强已落实：writer回滚前自身计数0、插入前0；历史逐child一条指定reply/计数1、旧root关联精确复核、task descriptor精确字段。

QA 只运行：前 verify → `--isolated-parent-comment-chain` → `--isolated-parent-historical-chain` → 后 verify。13316 自有实例空闲先核，每连接核 PID/datadir/schema，不占用已有实例，owner停止释放；保存前后raw及两个result原件路径/hash。

新建链：六 unique links，实际 finalize 全排序祖先锁后，distinct writer FK INSERT 超时、writer事务内0/回滚后0；fixture sentinel正常回滚父相关五表不变，释放后1并清理。不是业务自行拒绝membership漂移。

历史链：四条预存root/comment，root具有独立合成旧run站点关联、comment全库无links；当前batch两个子run仅各一条新depth2回复，四任务各全完成，parent计数2，历史内容不变，删除历史中间祖先事前拒绝/父五表零写。旧run关联不是认证历史成功批次。

两个mode都不证明历史祖先UPDATE并发/下一槽认证cursor闭环/完整terminal字段矩阵/translation预算；真实HTTP、AI、通知、恢复不运行。生产FULL_RUNTIME_NO_GO/CUTOVER_HOLD，国内不动，不切共享入口、不第二consumer、不重试受限proof。

已核收独立QA v147：开发负责人重算六份原件SHA与报告全部一致。前后verify均 `667de346ba91f47f14d552399078731353c0064889f1f17f2fdd568ef18667f7`；新建链raw `755e13f21b676bd80019d5683cd75467fca1b4fe6d2d06c5fde285d6a20f806e`、5wHrRE/result `2144ac49487a34b4ac616be302d0f6ce7e5e26b0d3d7aa3778b7c2b9a5e6088f`；历史链raw `9ac1cf3a5cebf57d8571d9aa80cd2f1f727222b4f618206e406084c7317096d5`、B5yczp/result `3520e143f7e0237b2f9728df8db802ba6dfdccb55da68d82b14a1b87bd7e96d9`。四命令exit0，两owner停止释放。局部PASS已回报项目经理；未覆盖范围和生产HOLD保持。
