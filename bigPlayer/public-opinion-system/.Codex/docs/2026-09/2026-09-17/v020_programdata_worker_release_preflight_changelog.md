# v020 ProgramData Worker 独立运行包与预检

## 变更

- 新增 Worker 独立 release 构建、运行时闭包复制和 SHA-256 manifest 校验。
- Worker release 仅包含 `worker/src`、实际引用的 `server/src` / `shared` 文件、生产依赖及 `scripts/q1_crawler.py`。
- 新增隔离 Worker preflight：验证 WinSW、Node/Python、XML 环境变量、ACL 和运行路径。
- 新增只读 Worker readiness：从 release 内加载运行时代码，仅允许 `SELECT`/`SHOW`，校验 schema、lease、epoch 与必需迁移。
- 日报输出根目录与锁目录支持 ProgramData 环境变量，避免回写 release。
- `install-services.cmd` 仅开放 `/preflight PublicOpinionWorker`；Worker `/apply` 明确拒绝。

## 验证

- `v188_worker_release_preflight.test.ps1`：PASS，405 files。
- `q1DailyPaths.test.js`：2/2 PASS。
- lease/epoch/scheduler 相关测试：26/26 PASS。
- `install-services.cmd /preflight PublicOpinionWorker`：PASS，真实数据库只读 readiness PASS。
- v169 Windows PowerShell/pwsh 与 v182 API 运行包回归：PASS。
- PowerShell/Node/Python 语法及目标 diff check：PASS。
- 已运行 API 保持 Running 且数据库 `ok`；未安装 Worker，生产 Worker 工件与 preflight 残留均为 0；旧任务未变。

## 剩余边界

- 本阶段仅完成 Worker 运行包与零副作用 preflight；真实 Worker 安装、启动和旧任务切换仍需后续明确授权。
- Git 工作区无干净基线，变更范围可证明性仅作审计风险记录。
