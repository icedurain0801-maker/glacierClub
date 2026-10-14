# v229 TapTap Worker-only 切换/回滚隔离预检

- 测试日期：2026-09-20（北京时间）
- 测试类型：候选发布前只读隔离预检
- 范围：candidate manifest、Worker hash、固定 WinSW hash、Worker rollback 材料、API 前后 hash、API material 误用 fail-closed
- 明确未执行：Apply、服务安装/停止/启动/重启、复制到服务目录、删除、数据库写入、manual sync、真实部署/补跑/发版

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 自动化隔离预检 | PASS | `node --test .tests/2026-09/2026-09-20/v226_worker_only_cutover_preflight.test.js`，1 passed / 0 failed |
| Worker-only 材料误用 API wrapper | PASS | API wrapper/XML 被作为 Worker rollback material 时 fail-closed |
| API 工件保护 | PASS | 误用拒绝后 API wrapper/XML SHA-256 前后不变 |
| 禁止动作清单 | PASS | 结果显式包含 deploy、service-install/stop/start/restart、database-write、manual-sync-run 等禁止项 |
| 预检脚本缺候选目录 | PASS（fail-closed） | 直接运行 `node scripts/windows-services/verify-worker-only-cutover-plan.js` 输出 `WORKER_ONLY_CUTOVER_PREFLIGHT: candidateRelease is required`，未执行任何服务动作 |
| 语法/空白 | PASS | `node --check scripts/windows-services/verify-worker-only-cutover-plan.js`；`git diff --check` 通过 |

## 隔离合同覆盖

自动化 fixture 验证候选 Worker entry/manifest、WinSW hash、Worker rollback XML 的 service id/worker entry/`BUILD_SHA`、API artifact hash 快照，以及 API wrapper/XML 误用拒绝。fixture 使用临时目录和自定义 hash 依赖，不连接真实服务目录或真实发布目录。

## 结论

Worker-only 切换/回滚材料的隔离预检 **PASS**。当前没有真实 candidate release，也没有发布授权；不得执行服务动作，不得据此宣称已切换、已回滚或线上数据已恢复。实际发布必须取得新的明确授权并重新执行本预检。
