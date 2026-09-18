# v189 ProgramData Worker 运行包与 preflight：开发验收记录

- 日期：2026-09-17
- 结论：开发侧 PASS，待项目经理正式送测试负责人独立验收。
- 边界：未执行 Worker `/apply`，未安装或启动 Worker，未修改/重启已运行 API，未修改旧任务、生产配置、数据库数据或生产 ACL。

## 结果

| 检查项 | 结果 |
|---|---|
| Worker 独立版本化 release | PASS，405 files；41 个源码闭包文件及 `scripts/q1_crawler.py` |
| 生产依赖与 manifest | PASS，干净 npm production dependencies、SHA-256 复算与篡改拒绝 |
| reparse、依赖逃逸、用户路径泄漏 | PASS，fail-closed |
| Worker XML | PASS，独立 release 入口；mode=`enabled`；interval=`60000` |
| 配置/数据/日志路径 | PASS，配置指向 ProgramData；日报、锁、状态、日志指向 data/logs |
| ACL | PASS，release/services/config 为只读，logs/data/locks/state 为可写 |
| Node/Python | PASS，Node 入口与依赖解析；Python stdlib 脚本内存编译 |
| schema/lease/epoch | PASS，使用 release 内代码并将连接限制为 `SELECT`/`SHOW` 后完成真实只读检查 |
| 租约与 epoch 单测 | PASS，26/26 |
| API/端口/旧任务保护 | PASS，API Running 且 DB `ok`；Worker SCM/工件为 0；3001/3306/4320 与旧任务状态保持 |
| 临时残留 | PASS，0 |

## 待独立测试

请项目经理正式送测试负责人复跑 v188、Worker API-only preflight、ACL 负向路径、manifest/reparse/依赖逃逸及只读 schema admission。Worker `/apply` 继续禁止。
