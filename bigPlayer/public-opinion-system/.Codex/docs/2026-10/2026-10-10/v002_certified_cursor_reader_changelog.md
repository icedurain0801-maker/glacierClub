# 隔离认证游标 reader 与父成功登记

Status: ISOLATED_CERTIFIED_CURSOR_READER_PASS

ParentStore 新增私有 WeakMap 品牌 reader；初始无记录返回null，已存在cursor但无登记原父失败关闭。scope八字段及数据库归属核验。原firstClaim epoch1父成功收尾在事务内捕获完整证据指纹，只有成功 COMMIT ACK 才内部登记 verifier，partial/回滚/ACKunknown不登记。读时复核原parent/child全集、审计、任务账本、CP、祖先完整闭包和父终态event/cursor；current准入分支排序锁后重读，任意证据漂移拒绝。祖先模块增加快照只读接口，原锁入口语义保留。

新增两个隔离SQL mode，认证成功读/身份与证据漂移零写、未知ACK不登记；测试当前尚待运行，不称下一槽完成。国内不动、生产HOLD，无真实HTTP/AI/通知、恢复proof或第二consumer。

已扩为三mode：成功读取/初始准入、父ACKunknown、partial不登记。开发KjKiyz/uhxWQK/VGyVHz原件PASS且owner停止释放。复审发现同source其他批次审计误纳ACK指纹，已修为原children精确audit/event UUID集合，并加入本批membership完整行指纹。增加manifest/task/缺child drift及同source无关合成audit不影响认证反例；该合成audit不是下一批真实执行证明。修复后须fresh冻结复验和独立QA。生产HOLD及下一槽未验不变。
