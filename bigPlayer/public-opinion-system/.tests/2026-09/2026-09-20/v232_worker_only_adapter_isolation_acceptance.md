# v232 Worker-only adapter 隔离验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：adapter 隔离 mock
- 范围：Worker 服务名门禁、非链接输入、固定 WinSW hash、注入 ops、事务回滚挂接
- 边界：未发现或操作真实服务，未访问 ProgramData/DB，未补跑、未部署、未发版

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 拒绝非 Worker 服务名 | PASS | `adapter rejects non-worker` |
| readiness 故障回滚 | PASS | `adapter isolation rollback keeps API` |
| API 文件不变 | PASS | readiness 故障回滚用例断言 API 文件保持不变 |
| 定向自动化 | PASS | `node --test .tests/2026-09/2026-09-20/v228_worker_only_adapter.test.js`，2 passed / 0 failed |
| 语法/空白 | PASS | `node --check scripts/windows-services/public-opinion-worker-only-adapter.js`；`git diff --check` 通过 |

## 结论

Worker-only adapter 隔离最小件 **PASS（mock）**。本结果不代表真实服务、ProgramData、数据库或线上切换已验收；任何真实切换仍需独立授权和真实环境预检。
