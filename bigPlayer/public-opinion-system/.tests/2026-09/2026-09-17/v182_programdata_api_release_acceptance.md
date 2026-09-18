# v182 ProgramData API 运行包开发验收记录

- 日期：2026-09-17
- 结论：开发侧 PASS，待测试负责人独立回归。
- 安全范围：未执行 `/apply`；未安装、启动或停止 Windows 服务；未修改生产 ProgramData、数据库、旧任务或现有监听进程。

## 结果

| 项目 | 结果 |
|---|---|
| `npm ci --omit=dev` 干净依赖构建 | PASS |
| allowlist / 无 Worker / 无测试 / 无 workspace symlink | PASS |
| JS 语法和字面量依赖解析不逃逸 RuntimeRoot | PASS |
| 源码绝对路径、`C:\Users`、`AppData` 泄漏检查 | PASS |
| SHA-256 manifest 复算与篡改拒绝 | PASS |
| 服务模式配置缺失、非法文件、symlink 拒绝 | PASS，3/3 |
| WinPS 5.1 / pwsh | PASS |
| v164 / v169 / v173 / v177 / v182 | PASS |
| 四个无参数 dry-run | PASS |
| `install-services.cmd /preflight PublicOpinionApi` | PASS，391 files；apply/preflight 同构路径验证 |
| preflight 临时目录清理 | PASS，0 残留 |
| 4320 健康与数据库 | PASS，`ok` |
| SCM、生产 ProgramData、3001/4320 PID、旧任务 | 前后不变 |

## 待独立测试

请测试负责人直接复核 release manifest、reparse/path-leak 负向用例、完整 API-only preflight，以及生产状态零副作用。真实 `/apply` 继续冻结。
