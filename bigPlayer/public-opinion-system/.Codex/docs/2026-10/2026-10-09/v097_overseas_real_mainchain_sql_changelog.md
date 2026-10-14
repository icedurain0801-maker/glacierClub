# 新 Node 实际主链真实 SQL 候选

Status: development-unverified / RUNTIME_NO_GO
Date: 2026-10-09

本项沿用 v092 隔离边界及项目经理下一阶段派单。员工只读提出最小表与接线建议，开发负责人审核并唯一落地。

- 新增 `scripts/overseas-isolated-mainchain.js`：补合成当前无 board 列 schema；新 Node 显式 stdin 配置，核端口/serverId/datadir/pid/version 后才恢复真实 receipt、创建真实 Journal、运行 actual runSource/Repository/PageStore/PageJobs。固定合成 transport，不调用真实 HTTP，不消费 AI/翻译队列。
- 修改 `scripts/overseas-isolated-mariadb.js`：新进程实际执行单站主链并读回终态/内容/入队/checkpoint/关联/来源成功记录，另一站维持 queued；原双 owner claim 移到另一站。只读 SQL 观察计数不伪造 ACK。
- 可选 `setRunBoardName` 在合成 child 禁用，因当前缺 board 列；其他主链 SQL 不 stub。合成内容时间取 receipt 窗口中点。旧候选 14 快照不修改。

验证待执行：语法、隔离实例 8 项、新增安全闸离线验证、员工只读复审、新快照独立 QA。多站部分进度、epoch>1、崩溃恢复、全入口独占和真实上游仍未完成；本项不代表生产 GO。

首轮语法通过；新实例 K5HJNm 在合成表创建阶段报 ER_CANT_CREATE_TABLE，只有身份检查完成，自有实例已关闭、13316释放。根因候选为原八表默认字符集与新增外键表 utf8mb4 不一致，统一合成八表字符集后重验；保留失败证据，不计作通过。

第二轮 tUPxtk 完成前五项，child主链未通过，实例正常关闭；员工复审指出 Journal owner 应取 actual claim 返回随机 owner，而非拼 runId，已修正为只观察 actual claim 返回值，异常时确保 pool.end。父入口只保存白名单错误代码，不记录 child stderr 中的任意内容。合成表并非完整生产 schema 等价快照，后续结果不得扩大该证据范围。

第三轮 HdAMJE 开发隔离真实 SQL 8/8 PASS：新 Node actual runSource 执行，真实 claim/renew/content/analysis/translation/terminal 各1；内容1、pending分析1/pending翻译1、checkpoint4；另一站queued。实例已关闭、13316释放，现役3306/3001 owner与三个PID创建时间未变。冻结候选15离线12文件99/99 PASS、643项文件清单；仍需独立QA，合成transport不是真实HTTP，队列入队不代表AI或翻译执行。
