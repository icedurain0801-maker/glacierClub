# v148 隔离认证游标接线方案

Status: DESIGN_ONLY_NOT_IMPLEMENTED

员工只读梳理，开发负责人收口。现 timeAnchor 和 admission 仍读取裸 completed checkpoint MAX，不能称下一槽闭环。下一实现拟只增加明确的隔离 certified 入口：ParentStore 模块先创建绑定 repo/isolation 的空 WeakMap 品牌 cursor reader；只有原 epoch1 ParentStore 成功 COMMIT ACK 后才能内部登记该 parent verifier。partial、回滚和 ACK unknown 不登记，数据库有 cursor 而无已登记原 parent 须拒绝，不能返回 null 或重建 proof。

reader按 source/account/game/community/site/board 六字段及 URL/hash 精确核 scope。无 cursor 返回 null；有记录内部重读原 parent/全部 siblings/child terminalFence、bound audit、ledger progress、links/CP/tasks/manifest/hashes，重建 parent evidence 和计数，精确验证固定 parent terminal event 及完整 cursor 集合。不可只信 cursor 时间或 SHA 字符串。

隔离 timeAnchor 使用同 reader 和 DB 时钟，隐藏品牌绑定完整证据，完全不 MAX checkpoint。隔离 admission 使用同品牌 reader/current READ COMMITTED 锁重核；anchor到admit任意证据变化零写拒绝。旧新入口互斥，不影响现役旧入口。

负测至少覆盖空bootstrap、成功后认证读取、伪CP不影响、plain/copied/cross-repo reader拒绝、未知parent/partial/ACKunknown拒绝、scope/URL/hash逐字段漂移、父child/集合/event/账本漂移、anchor后同时间换parent/hash拒绝、重启registry丢失后失败关闭。不得恢复proof、生产DDL、真实HTTP或第二consumer。

当前fixture认领最新到期槽，刚收尾下一槽尚未到；不得伪造clock或重配frequency冒称原配置真实下一槽。真实下一槽需最低合法900秒配置保持自有实例到真实DB边界；若只测认证读取/准入，下一槽完成仍标未验证。此文仅方案，无实现、无SQL、无新冻结或生产动作。
