---
status: blocked
priority: P0
date: 2026-09-21
role: test-owner
---

# v057 Worker cutover EBUSY 独立复核

## 结论

**隔离事务逻辑 PASS；候选交付 FAIL/退回补齐，暂不关闭 P0。**

## 通过证据

- 候选：`.temp/candidates/v057-worker-cutover-ebusy-gate-20260921`
- manifest SHA-256：`E0D15816FA436941E756B6EC0331882A58FB15F8DD1C705207A3C2965C774A4A`
- manifest 4 个文件逐项 SHA-256 复算：全部匹配
- 候选 transaction SHA-256：`E58DF6D5C1FAF9545B9DA719AAAAA39A4E53B765B3D03CA82795FD9B4A803A89`
- 候选 controlled CLI SHA-256：`C22CF5816182D2108887DDA6D57AE65FED7207A3151EC25A31059EBDD56ADA45`
- v283 + v284 合并执行：`7/7 PASS`
- v227 既有事务隔离测试：`5/5 PASS`
- `node --check`：PASS
- `git diff --check`：PASS

矩阵覆盖确认：

- wrapper 或 Node 仍存活时返回 `EBUSY`，禁止复制，原字节不变；
- wrapper/Node 均退出且文件可独占时才允许复制；
- mutation gate 超时返回 `WORKER_MUTATION_GATE_TIMEOUT`，不执行 install/start，字节不变；
- rollback 使用同一门禁，回滚门禁超时不写回滚字节。

## 交付阻塞

在候选目录直接执行：

```text
node scripts/windows-services/worker-only-controlled-cutover.js --preflight --controller=fake
```

结果为 `MODULE_NOT_FOUND: ./public-opinion-worker-only-adapter`。该依赖未包含在候选 manifest 中，因此无法从交付候选目录独立复现候选 CLI preflight；开发侧声明的 formal1 只读 preflight 证据暂不能由 QA 独立重放。

## 边界

- 未操作真实服务、数据库、API、3001 或 Worker；
- 未创建 run；
- 未修改候选文件或业务代码。

## 退回要求

开发负责人需补交完整可执行候选（将 `public-opinion-worker-only-adapter` 纳入候选/manifest，或提供明确且可验证的基线依赖合同），并重新提供 CLI preflight 的 `apiUnchanged=true`、`workerCalls=[]` 证据。补齐前不得宣告 v057 总体 PASS 或执行真实切换。
