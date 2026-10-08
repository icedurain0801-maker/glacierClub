# Worker-only 受控切换/回滚：隔离预检门禁

日期：2026-09-20

状态：隔离预检通过；**未部署、未重启、未补跑、未发版**

## 新增只读门禁

- `scripts/windows-services/verify-worker-only-cutover-plan.js`
- `.tests/2026-09/2026-09-20/v226_worker_only_cutover_preflight.test.js`

验证器没有 `Apply` 模式，也不包含服务安装、启动、停止、重启、复制到服务目录、删除、数据库写入或手动同步动作。它只读取并验证：

1. 候选 release 的 `worker/src/worker.js`、manifest 和完整 `verify-worker-release.js` 结果；
2. 候选独立 WinSW source 是否等于固定 SHA-256；
3. 当前 Worker-only wrapper/XML 回滚材料是否确为 `PublicOpinionWorker`，是否指向 `worker/src/worker.js` 并带 `BUILD_SHA`；
4. API wrapper/XML 的 SHA-256 前后快照是否不变；
5. Worker material 不得直接复用 API wrapper 或 XML 路径，候选 release 不得包含 API service 工件。

任何前置不满足均 fail-closed。输出中还显式列出禁止行为：`deploy`、服务控制、数据库写入和 manual sync run。

## 隔离结果

使用 `v005` 的 `.temp` 隔离候选、Worker-only 回滚副本、候选 WinSW 副本和现有 API 工件进行只读验证，输出：

- `status: PASS`
- 候选 worker entry SHA-256：`EC8727D3BE62357A1AA1D4315F5A4E3C58C797988D805964627CFF39C1667792`
- 候选 manifest SHA-256：`535F3461DDF7CDF29CEFB428EB70DDA92E693604CC98D9A58A701075A18C3158`
- WinSW source SHA-256：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`
- API wrapper/XML 前后 SHA-256 一致。

自动化 fixture 另验证了 API material 被误作为 Worker rollback wrapper 时会被拒绝，且拒绝后 API 两个文件 hash 保持不变。

```powershell
node --test .tests/2026-09/2026-09-20/v226_worker_only_cutover_preflight.test.js
# 1 passed, 0 failed

node --check scripts/windows-services/verify-worker-only-cutover-plan.js
git diff --check -- scripts/windows-services/verify-worker-only-cutover-plan.js .tests/2026-09/2026-09-20/v226_worker_only_cutover_preflight.test.js
# 均通过
```

## 后续授权前置与拟议切换/失败回滚

后续必须由用户重新授权发布窗口，并且在批准的新 ProgramData candidate release 上重做本预检。授权后仍应按如下单 Worker 顺序执行，不调用全局 `rollback-services.cmd`：

1. 再次记录 API wrapper/XML hash、当前 Worker wrapper/XML/release/manifest hash 和服务状态；API 任一 hash 不符合预期即中止。
2. 从经复核的 rollback WinSW binary **只读复制**到新的 `PublicOpinionWorker.exe` 目标，按 Worker 专用模板渲染 XML；API XML/manifest 不参与该步骤。
3. 运行本验证器和既有 Worker release/ACL/readiness 门禁，确认候选 manifest、`BUILD_SHA`、LocalService、Worker entry 和 API 快照。
4. 仅在第二次明确切换授权后，才允许按批准的 Worker-only 程序停止/安装/启动 Worker；不调用 API 服务命令，不触发 manual sync。
5. 若 manifest、账户、入口、启动或健康检查任一失败：停止新 Worker，恢复已保存的同一 Worker wrapper/XML 对旧 release 的引用，启动旧 Worker，并复核 API hash/状态不变。若无法满足“只 Worker”恢复条件，直接中止并升级，不得退化到全局 rollback。
6. 成功后只观察一次自然频率触发的 checkpoint/run/去重证据；不得以 HTTP 200 或 completed 直接宣称今日内容恢复。

## 尚未授权/未实现的动作

本次没有创建 ProgramData release、没有变更服务 root、没有保存真实服务新备份、没有安装或启动任何服务。实际切换/回滚执行程序仍须在明确授权窗口内按上述门禁单独实现或批准；本次工具仅提供只读 fail-closed 验证材料。
