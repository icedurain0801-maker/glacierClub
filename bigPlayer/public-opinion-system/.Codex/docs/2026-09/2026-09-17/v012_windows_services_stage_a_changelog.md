# v012 Windows 常驻服务阶段 A 变更记录

## 状态

开发与自动化验证完成，待测试负责人只读验收。阶段 B 高影响操作未授权、未执行。

## 变更

- API 与 Worker 增加运行监督、心跳与优雅停止能力。
- 统一调度增加数据库 UTC 驱动的全局扫描租约、owner + epoch 栅栏、每批最多 100 条的过期任务恢复及 `SYNC_RUN_POISONED` 标记。
- 增加 WinSW API/Worker 服务模板、配置渲染、静态校验、安装、旧任务导出/停用和回滚脚本；所有高影响脚本默认保持 dry-run。
- 修复旧任务导出门禁：`export-legacy-tasks.cmd` 无参数或 `/dry-run` 仅预览且不创建目录、不查询任务、不写 XML；未知/错误参数以退出码 `2` 拒绝，只有阶段 B 明确授权后传入 `/apply [output-directory]` 才进入真实导出分支。
- 针对目标库已登记旧版 023、但运行期契约后补的迁移漂移，新增 `026_scheduler_runtime_schema_reconciliation.sql`；不修改或重跑 023，幂等补齐 `po_sync_runs.lease_epoch` 与 `po_worker_heartbeats`，并对列和索引定义 fail-closed。
- Server/Worker schema admission 现要求 023、025、026 均登记，并核验同步租约 epoch、全局 Worker 租约和心跳表完整契约。
- 增加本机舆情服务恢复 skill，并通过结构校验。
- 修正 `worker/test/unifiedSourceSchedulerJob.test.js` 的租约失败测试桩：不再依赖 SQL 参数固定下标，适配调度时间参数加入后的参数布局；业务逻辑未改。
- 阶段 B1 安装工件返工：按 WinSW v2 同名发现规则部署 `PublicOpinionApi.exe`/`.xml` 与 `PublicOpinionWorker.exe`/`.xml`；安装、卸载、状态和回滚命令不再向单一 `winsw.exe` 传 XML 路径。新增独立卸载/状态脚本、绝对日志路径渲染，以及可选部署目录的 EXE 哈希、XML 配对、符号链接拒绝和 ACL 白名单只读校验；所有无参数路径仍为零副作用 dry-run。

## 验证

- Server 全量：`npm --workspace server test`，`414/414 PASS`。
- Worker 全量：`npm --workspace worker test`，`221/221 PASS`。
- 026 补偿迁移与 schema admission 专项：`144/144 PASS`，相关 JS 语法检查及 `git diff --check` PASS。
- 租约与过期恢复专项：`20/20 PASS`。
- Windows 工件：`scripts/windows-services/validate-artifacts.ps1`，PASS；默认导出目录不存在，负向参数均按预期拒绝且零副作用。
- WinSW v2 同名布局专项：静态命令构造、XML 解析、四个脚本无参数/非法参数零副作用均 PASS；仓库根 `.temp` 隔离沙箱中双 EXE SHA-256 一致、四文件 ACL 白名单与同名 EXE/XML 配对 PASS，沙箱未触碰真实服务目录。
- 恢复 skill：`quick_validate.py`，`Skill is valid!`。

## 阶段边界与剩余风险

- 未安装 Windows 服务、未写机器环境变量、未停用旧计划任务、未执行真实数据库迁移、未做 24 小时实跑、未 push、未发版。
- 双实例互斥、旧 epoch 拒绝与恢复收敛已由自动化测试覆盖；真实数据库断连后恢复、SCM 拉起和 24 小时稳定性须在阶段 B 获得单独授权后验证。
- Worker 的 5/30/60 秒恢复由 WinSW/SCM 工件提供；当前不宣称 Worker 进程内 supervisor 已接入主入口。
