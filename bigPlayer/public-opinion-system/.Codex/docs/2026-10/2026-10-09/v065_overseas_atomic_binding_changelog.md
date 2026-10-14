# 海外原子入队能力及提交回执绑定

Status: isolated-candidate / developer-35-PASS / runtime-NO_GO

本批按既有派单修复：调用方布尔标志不再足以跳过原入队。

- PageJobs 仅完整 light 策略回调和 zh-CN 翻译版本由 factory 构造时拥有私有身份；逐条拒绝缺失/非法light策略，翻译配置复制冻结。
- PageStore 仅捕获该回调的原始 upsert 方法具有能力身份；router拒绝普通/伪造方法且稳定返回原始方法，不用bind丢失身份。
- 同事务回调执行并commit ACK成功后才产生私有内容回执；回滚、钩子失败、commit未知均无回执。
- 网络前、页返回及下游跳重复入队处检查能力与回执；无绑定失败关闭，不回退到旧链。回执按内容对象、UUID、fingerprint绑定，不允许普通对象字段伪造。
- 非目标来源不检查新能力，既有行为不变。

剩余：可信候选factory/loader/connector/实际策略接线，run首次及resume/epoch，观察恢复，全入口drain、第二源及真实运行均未完成。WeakMap/WeakSet用于防接口误用，不是同进程恶意代码隔离；不代表生产授权。v063冻结候选不改，新验证另建快照。

员工审查发现truthy/===true混用，已统一严格boolean及目标判定；目标真实atomic方法丢flag也拒绝，非目标完全不进入新预检。新增缺策略/伪造hook、普通/包装方法、缺flag/字符串flag、未提交回执、失败rollback、commit未知、翻译配置mutation与非目标测试。回执另绑定source及原始方法，防跨store/跨source复用。

活动树最小联合24/24 PASS；候选6冻结630项7tests开发35/35 PASS exit0，测试后hash一致。清单v066，交接v067；独立QA待完成。
