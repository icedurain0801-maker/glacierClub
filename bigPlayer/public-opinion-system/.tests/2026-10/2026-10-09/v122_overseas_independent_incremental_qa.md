# 海外 scheduled 三项独立增量 QA

Status: `ISOLATED_INCREMENTAL_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅复验开发交接指定的 `manifest.incrementalOffline` 与 `manifest.incrementalFailureSql` 两项；未运行累计 inspection、旧成功链、未知 ACK 恢复、epoch2 或生产任务。未修改业务代码、生产配置、任务、数据或国内现役 Worker/健康调度；未触碰 Discord、TapTap、Facebook、算法基线。

## 复验结果

| 项目 | 命令/证据 | 结果 |
|---|---|---|
| 纯测增量 | `node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasControlledManifest.test.js worker/test/overseasParentEvidencePolicy.test.js` | `13/13 pass`，`OFFLINE_GUARD_DENIALS:{}`，exit 0 |
| pageSize20 预算路径 | `node scripts/overseas-isolated-mariadb.js --scheduled-budget20` | exit 0；`PASS_ISOLATED_SCHEDULED_FAILURE_PATH_PARTIAL`；40 条唯一内容/links；三个 feed failed，CP 保留 `items=20,last=null`；`realHttpExecuted=false`、`aiExecuted=false`、`productionTouched=false`；实例端口 13316 已释放 |
| 二页异常路径 | `node scripts/overseas-isolated-mariadb.js --scheduled-second-page-error` | exit 0；`PASS_ISOLATED_SCHEDULED_FAILURE_PATH_PARTIAL`；20 条唯一内容/links；三个 feed failed，首页 CP 保留 `items=20,last=null` 并释放 owner；`realHttpExecuted=false`、`aiExecuted=false`、`productionTouched=false`；实例端口 13316 已释放 |

开发冻结 raw 复核：

- `.temp/overseas-real-db-uMRclU/result.json` SHA256 `c9d0cb4ca31d61c78d86901617efb906c609ff06d7ac721d2ebf81c56a8ed8bf`，与交接一致。
- `.temp/overseas-real-db-N1pfKv/result.json` SHA256 `2c3e90175f4ff366ab622d58ea88362e7b7f4995838280cf058535d9f2828504`，与交接一致。
- 本轮 QA 自有 fresh 实例另生成 raw：预算 `O8Wf7n/result.json` SHA256 `70cf401e302cf6d93004ca81b7129bac60951e678584940186c4beeddef1845a`；二页异常 `DJZaEl/result.json` SHA256 `5fd1a55e88b4aa2766cbc0313cd091a9900509fbe8b9ab47afdf413df7e7a074`。两者为新运行证据，不替代冻结 SHA。

## 四辅助模块只读复审

四文件 `node --check` 均通过。静态调用检索显示：

- `overseasScheduledExecutionGate.js` 仍标注 `NOT_INTEGRATED`，仅导出原语，未接入 factory/dispatch/page/audit。`close()` 在 `alive=false` 后，排队的 `verify()` 失败路径会调用 `destroy()`；若未来与在途 `work()` 接线，可能在 work 完成前销毁持锁连接。该风险未通过动态竞争测试，当前应标为“原语缺陷/待动态证明”，不能直接推导生产事故。
- `overseasScheduledIsolatedTarget.js` 的位置访问器没有调用方；repo 绑定检查仍由 `assertScheduledIsolatedTarget` 执行。未证明跨 repo/root 组合授权已接线。
- `overseasScheduledRequestJournal.js` 与 `overseasBigPlayerRunContractJournal.js` 的位置访问器没有调用方；只读复审未发现文件格式读写变化，但未证明调用链完成组合校验。

补充确认（只读、无 DB）：

- `assertScheduledIsolatedTarget(target, repo)` 只判断 `targets.get(target)?.repo !== repo`。当 `target` 与 `repo` 同时为 `undefined` 时，比较结果为假，未登记品牌会被接受；因此 `target undefined` 组合是确定的原语缺陷，不能当作隔离身份通过。若 `repo` 已提供而 `target` 为 `undefined`，则会拒绝。
- `run()` 在 `finally` 中才 resolve `drained`，而 `close()` 返回的 promise 先等待 `drained` 再处理释放。源码没有内置防止 `work()` 回调调用 `await gate.close()`；该调用会让 work 等 close、close 等 drained，形成可达等待环。当前未接入 factory/dispatch/page/audit，未做动态竞争或挂起实验，生产影响标记为 `NOT_VERIFIED`，但原语设计不能宣称已排空。

证据完整性补充：

- 外部 manifest 锚为 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-qvW4xk/scheduled-freeze-manifest.json`，SHA256 `0f6aed5841d6dea8ca33f4d05353219944b0feb67f4efffc60852aa82607597e`，`inventory.files.length=686`。manifest 声明的 verify 命令为 `node scripts/freeze-overseas-scheduled-candidate.js --verify <external SHA256>`；686 前后命令输出原件路径未在当前 QA 可见落盘范围发现，故前后独立核验标记 `NOT_VERIFIED`，不把开发交接转述当作独立结果。
- 13 纯测本轮终端输出确认 `13/13 pass` 与 `OFFLINE_GUARD_DENIALS:{}`，但没有单独 raw 文件路径或 SHA 可供复核；因此 raw 证据标记 `NOT_VERIFIED`。本报告保留测试命令与观察结果，不重新执行制造新证据。

## 结论与剩余边界

本批增量在隔离 fake/合成 transport 范围内通过，不能升级为真实海外采集、真实持久预算/outbox、parent SQL/cursor 并发、异步 AI、未知 ACK 执行恢复或 epoch2 通过。整体维持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；默认 500 页、恢复/epoch2、真实预算/通知/parent SQL 均未交付。四辅助不放行、不接 factory。后续需由开发负责人先完成接线和动态竞争证明，再由 QA 重新验收。
