---
status: pass
priority: P0
date: 2026-09-21
role: test-owner
---

# v057e Worker 服务注册分支独立盲测

## 结论

**PASS（候选隔离 + 真实只读 preflight）。** 候选具备重新申请唯一真实切换的测试资格；本轮未执行真实 stop/start/install/copy，不代表切换完成。

## manifest

- 候选：`.temp/candidates/v057e-worker-cutover-service-registration-20260921`
- manifest SHA-256：`2424B512AD67D5D428EC5F1DA7AA7070F8D98427268A834013457E02345E2553`
- 13/13 文件逐项 SHA-256 匹配
- 依赖闭包完整，脚本 `node --check` 全部通过

## 独立测试结果

- v227：5/5 PASS
- v283：4/4 PASS
- v284：3/3 PASS
- v289 真实 PowerShell probe：4/4 PASS
- v291 服务注册分支：4/4 PASS
- v292 已注册/未注册服务流程：4/4 PASS
- v293 未注册服务真实 probe：1/1 PASS
- 合计：25/25 PASS

覆盖确认：已注册服务走 stop -> mutation gate -> copy/start，不重复 install；未注册服务跳过无效 stop 但保留 mutation gate，install 恰一次；安装后失败回滚停止、恢复字节且不重复 install；活进程/文件锁/超时均 fail-closed。

## 真实只读 preflight

从候选根目录使用 formal1 既有只读参数执行真实 CLI：

- `status=PASS`
- `apiUnchanged=true`
- `workerCalls=[]`
- 仅执行文件/hash、SCM query 与 SELECT/SHOW readiness

## 副作用核对

- `PublicOpinionWorker` 仍为 `Running`
- 未执行真实 stop/start/install/copy
- 未写数据库、未创建 run、未修改 API/3001

## 交接

已回执项目经理：v057e 独立 PASS，等待唯一真实切换派单。真实切换后仍需提供唯一 runId，再独立验收 run 与浏览器。
