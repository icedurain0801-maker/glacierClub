# 隔离认证游标 anchor/admit 接线

Status: ISOLATED_CERTIFIED_CURSOR_READER_PASS

开发员工只读提供方案，开发负责人通过 apply_patch 唯一写入。TimeAnchor 新增明确 certified fixture 入口；隐藏 WeakMap 绑定 repo/isolation/原 reader，scope含六身份字段及 URL/hash，证据以 canonical 字符串冻结。AdmissionStore 可选品牌 reader，旧新 anchor 与 reader 混接拒绝；certified admit使用 READ COMMITTED、写入与幂等返回前重新验证完整证据，不读取裸CP MAX。旧入口保持原语义。

旧timeAnchor离线4测试通过、语法通过。Reader/verifier正实现中，尚无完整SQL验证或独立QA，不能称下一槽闭环。新增夹具拟覆盖初始空reader及anchor后未知cursor漂移零写。生产HOLD、国内不动，无真实HTTP/AI/通知、恢复proof或第二消费者。

后续旧anchor/admission/batch合计11离线测试PASS。真实MariaDB验证发现SET TRANSACTION不会改变@@tx_isolation会话观测，认证admit显式SESSION RC且finally恢复RR、失败销毁连接。初始认证空reader/admit、同reader绑定、未知cursor插入漂移拒绝已开发SQL通过；非null认证anchor/admit及真实下一槽仍未执行。员工静态复审无阻断。
