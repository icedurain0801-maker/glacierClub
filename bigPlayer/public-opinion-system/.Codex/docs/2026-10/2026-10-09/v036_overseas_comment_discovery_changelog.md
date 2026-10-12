# 海外评论发现与账密候选变更

Status: candidate / not-deployed / pending-independent-QA

新增海外父目标策略及测试，海外当前页 unchanged/旧父帖不再按正文变化跳过评论；历史目标按 source/account/game/community/site/board 证据 keyset 枚举，归属未知明确 coverage incomplete。国内原条件不变。

repository 新增只读历史枚举，未执行真实 SQL。该查询依赖候选 run board 字段；真实 schema 与事务兼容仍须核验，不能直接启用候选。

app 创建海外源时账密优先且验证账密，编辑允许 account_password，新增/多链接海外 origin 仅 club-en。未改默认国内分支或现有账号登录算法。

父评论窗外上下文/入库父链保全、仅 baseUrl 编辑校验、真实 schema 兼容与消费者排他尚未闭合。此记录不代表完整交付或 QA PASS。已执行目标策略与原去重/Q1 daily 测试 24/24 PASS。
