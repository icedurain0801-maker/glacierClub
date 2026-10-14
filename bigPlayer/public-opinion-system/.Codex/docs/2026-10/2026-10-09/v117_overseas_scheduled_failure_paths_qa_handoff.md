# scheduled runSource 异常路径增量 QA

Status: FROZEN / ISOLATED_FAILURE_PATH_PARTIAL_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

独立v088已完成：679前后hash、两fresh failureSql通过，QA owner停止/13316释放。负责人核预算N4IZfL result SHA `0219ba22f6116d8bd6df561ad0bcd73d6e5e831a6b04ac1d24751e502d543554`与transport93YhwQ SHA `0bdd47c9b61d27f48c7adb86c2f1a595887a2854631cfcf73f5365b6ea7a9e51`一致；仅增量隔离异常PASS。

新冻结：根 `.temp/overseas-qa-scheduled-stage-y9ZiDA`。
manifest SHA256：`53aca08f0f42ca7af5aa32c6fdaad5f7c6e3f5fe5fc3e5a5e8074588d84f6f43`。
冻结开发执行两条新failureSql，前后679条hash一致；未重复旧成功子链或旧76纯测来替代异常验收。

1. `node scripts/overseas-isolated-mariadb.js --scheduled-budget`：实际factory/runSource，全路径Asia/Shanghai。隔离pageSize10000让connector预算为1，provider hasMore/nextOffset1触发provider_pagination_budget_exhausted，child/audit partial/PARTIAL_SYNC；一唯一内容已提交，两类job各一pending；三个failed checkpoint保留offset1且owner/lease释放；账本未完成不能成功封口，parent/source-state/source全行不变。冻结原始结果根 `.temp/overseas-real-db-NVG3c2/result.json`。
2. `node scripts/overseas-isolated-mariadb.js --scheduled-transport-error`：三feed请求合成transport抛异常，授权/schema正常。child/audit partial，内容零、三failed CP cursor为空且owner/lease释放，父/源状态不变。冻结原始结果根 `.temp/overseas-real-db-QkNEym/result.json`。

两实例serverStopped/portReleased为true。runner收尾等待自有进程最多20秒；收尾NO_GO设置exit1，不能exit0掩盖停止证据缺失。
预算result SHA256：`66a383aea4bae687e944ce82ca218a4d63985a6ee0633ed04f79f96fc37c25b1`；transport result SHA256：`655b13ca77221ff77bd58ceac7279e135da7d5cf1a324227695f64881dd1bd3c`。

旧znyz3f结果NO_GO保留；其业务矩阵通过但5秒内未确认进程停止，后只读核自有PID已退出，不改旧结果、不强停。旧YWFdYy/zFqIdC只有页预算续段到DAILY_RUN_TIMEOUT，不称connector页预算；本包改为精确边界场景。真实常用pageSize20预算、首次提交后第二页transport失败仍未覆盖，须独立报告列明。

QA仅新冻结failureSql与前后hash，自行创建/关闭13316/serverId20261036/po_overseas_fixture；开发已释放，不接管QA实例。禁止3306、真实HTTP、账号刷新、AI/翻译消费、生产DDL、国内改停重启、第二生产消费者。epoch2/restart/未知ACK恢复、父聚合/cursor并发、shared scan/permit、AI持久预算通知仍待交付；本包局部PASS不能整批GO。旧包不重跑不改。
