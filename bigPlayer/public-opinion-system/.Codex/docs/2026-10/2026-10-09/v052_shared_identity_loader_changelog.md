# 共享消费者可信身份加载候选

Status: isolated-candidate / production-NO_GO

- 新增显式别名LEFT JOIN身份loader，核source/account/game/community/run一致与region/platform枚举；缺失矛盾失败关闭，不默认国内。
- 无run仍复用原默认账号选择语义，有run以库内账号为准；不查询凭据，不替代后续完整账号metadata或授权门禁。
- v049源码冻结不变，本模块属于下一候选，默认buildDeps尚不启用。调度/run恢复/drain全链与新响应准入继续未完成。
