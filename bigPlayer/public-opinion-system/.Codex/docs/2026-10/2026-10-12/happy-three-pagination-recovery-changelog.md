# 欢乐战三国分页与检查点修复

Status: 已发布并完成真实验收

## 问题与证据

原任务 `6c95fe87-aeb5-46f7-ad85-a74176cf0064` 为 partial / PARTIAL_SYNC。全部动态列表达到 offsetId=10000，累计200页，timeOrderVerified=false，最后日期已到2026年1月，无法证明窗口采集完整。原窗口北京时间10/11 00:00至10/12 17:47:50。

同一账户、NULL site_id、任务、窗口存在10条检查点，9条无游标；原先 INSERT IGNORE 依赖包含可空字段的唯一键，无法阻止这些重复记录。原始逐页排序审计未开启，首次时间顺序失效的具体原因待确认。当前只读列表和连接器实测均在第二页确认日期边界。

## 实现

- `server/src/connectors/bigPlayerH5Connector.js`：bounded 列表顺序失效时，只允许一次从首页重新验证。游标持久化 timeOrderRestarts，避免无限重读。重读仍乱序时继续保守遍历，达到提供方上限仍报告不完整，不伪报完成。已有累计页数、窗口过滤和入库去重保留。
- `server/src/db/repository.js`：领取检查点时事务锁定账户，先查已有记录，仅不存在才插入。只领取所选记录的ID；读取优先选择 completed 或已有游标记录，再按ID稳定排序。历史重复行保留，不改索引、不迁移、不删数据。
- `server/test/connectorSlice.test.js`：新增暂时乱序恢复和持续乱序测试。
- `server/test/checkpointIdentity.test.js`：并发NULL站点创建、历史重复记录、进度保留、失败回滚测试。

## 发布与验证

运行包从切换前最新现役包定点修改，仅上述两个运行文件及manifest改变。API和Worker在验收期间另有attention-v11更新，最终分别从该更新重新叠加本轮补丁，未覆盖该版本的业务变更。

- 最终API：`C:/ProgramData/PublicOpinion/releases/release-20261012-feed-recovery-v11-1791803728569`。
- 最终Worker：`C:/ProgramData/PublicOpinion/releases/worker-release-20261012-feed-recovery-v11-1791803959263`。
- 两个最终运行包合计104项连接器/检查点测试通过；manifest、语法、空白检查通过。
- Worker回归92/93通过，失败为既有深度分析告警断言 `deep without light_escalation trigger does not query light analysis`，本轮未改该文件或逻辑。
- 真实表结构读取与SELECT FOR UPDATE查询验证通过。浏览器只允许GET/HEAD，没有通过浏览器再次提交任务或删除记录。

实施中发现并修正两项遗漏：首次发布脚本误用了前端入口，已纠正并确认Worker进程；首次补丁引用检查点不存在的created_at，已回滚后改用真实现有字段，真实验收发现的问题未隐瞒。验收产生的失败任务保留为历史记录。

首次同步提交遇到临时LOGIN_FAILED，随后一次重试授权成功。增量验收因上述字段错误结束为partial；修正后提交限定窗口补采，没有继续扩大采集范围。

## 最终真实验收

任务 `93305c4d-5015-4ea6-8417-ccf8a7937315` 为 completed_authorized_scope，错误码为空。窗口北京时间10/11 00:00至10/12 19:12:28。21个feed检查点均completed且每个仅1条。页面显示发现283/入库125、抓取37、新增2、变更35、关联评论162；这些是不同统计口径，不能把入库125当新增125。

范围内现有内容按北京时间统计：10/11为60条，10/12为139条（含评论）。外网Edge浏览器运行记录页已核实“授权范围完成”，原partial不修改。

证据位于 `.tests/2026-10/2026-10-12/happy-three-*`，包括原任务、只读上游观察、最终任务、最终检查点/日期计数、运行包测试和页面截图。旧运行包及XML快照可回滚。

## 限制

本次验证不意味着上游持续乱序、认证失效或真实超过分页上限时也可以保证完整。遇到这些情况仍保留错误，避免遗漏被成功状态掩盖。原任务首次排序异常原因因缺少历史逐页证据尚未确认。
