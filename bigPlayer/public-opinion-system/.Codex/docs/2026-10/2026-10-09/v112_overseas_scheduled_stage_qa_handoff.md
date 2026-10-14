# scheduled 准入与首次领取阶段独立提测

Status: READY_FOR_INDEPENDENT_STAGE_QA / RUNTIME_NO_GO
Owner: 开发负责人

仅阶段提测，不缩v104最终范围，不代表完整scheduled/shared交付。旧manual候选17及其独立QA原件不动。本阶段包含固定DB锚/站点完成cursor窗口绑定、写前强制自有身份/schema门禁、原子父子准入/重放、首次claim admitted0→open1、双连接同child竞争、manifest故障回滚、真实COMMIT后ACK未知无proof、纯生命周期排空/回退规则。

## 冻结锚

- 快照：仓库根 `.temp/overseas-qa-scheduled-stage-a1hWmo/`
- manifest：`scheduled-freeze-manifest.json`
- 外部SHA256：`6dbe6e85afc3ff3b5637e7a05a98573d47a5845789284fa1016a852b2337458d`
- 668条源码/安装依赖闭包，源inventory和快照inventory逐项前后核；sourceInventory保留源路径/源hash、inventory为实际快照路径/hash。无依赖升级。
- 源脚本：`scripts/freeze-overseas-scheduled-candidate.js`
- AnUw8s是已发现上下文可变缺陷的旧冻结，不提测；保留、不覆盖。

## 开发验证（不是独立QA结论）

在a1hWmo冻结副本运行manifest所列6文件23用例PASS，guard拒绝0、skip/cancel/todo0。前后 `--verify <上述外部SHA>` 均668条通过。

冻结副本执行 `node scripts/overseas-isolated-mariadb.js --scheduled-isolated`：根 `.temp/overseas-real-db-D1ReMp/result.json`，6组实际SQL开发PASS，serverStopped/portReleased=true。只自有13316/serverId20261036/po_overseas_fixture；每store借连接核datadir/PID/schema/端口与schema，不加载env/worker主入口。旧manual矩阵不运行。SQL目标result保留原始文件，不能用productionTouched字段推断历史业务库未变。

SQL原件SHA256：`a759651cead8aa2a97c561255103ea935930b8b2498475cbcfe4b04a1b3fbf13`。已真实消息测试负责人和经理，独立结论待返回。

## QA执行边界

仅在该冻结副本独立运行，先核外部manifest SHA与全部inventory；后再核。纯测试用offline guard；自有SQL不能套阻断DB的offline guard，使用显式scheduled-isolated且先确认13316空闲。若失败保留自有原件，不清理旧快照/历史DB，不运行app.routes或其他未列测试。QA报告由测试负责人写，负责人不代写独立结论。

## 未完成项（明确排除本阶段放行）

| 事项 | 状态 |
|---|---|
| scheduled ledger/bootstrap/fresh fence/Journal真正接线 | 未完成 |
| restart持久恢复/epoch2及ACK未知claim恢复 | 未完成 |
| parent聚合与原子终态、成功cursor推进 | 未完成 |
| cursor并发写锁与admit/claim/terminal跨路径锁序 | 未验证 |
| shared真实queue/manual/due/poll与唯一消费者 | 未完成；生命周期仅纯测试 |
| schema CHECK/前缀索引/时间精度负测完整矩阵 | 门禁落地，完整SQL负测未完成 |
| 真实HTTP/账号刷新/AI/生产DDL/服务切换 | 未授权、未执行 |

请QA只给本阶段独立结论与缺陷，不把23用例或6组SQL推断成完整海外采集可运行。最终readiness仍false，RUNTIME_NO_GO。
