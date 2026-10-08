# v063 Worker 切换未注册服务门禁修复

## 变更范围

- 候选目录：`.temp/candidates/v057e-worker-cutover-service-registration-20260921`
- 未注册 `PublicOpinionWorker` 时跳过无效的 WinSW `stop`，但仍执行进程存活与目标文件独占检查。
- 已注册服务保持 `stop -> mutation gate -> copy/start`。
- 未注册服务仅在切换时安装一次；若安装后发生失败，回滚先停止服务、恢复原字节，不重复安装。
- API、3001、数据库与同步 run 均不在本候选的修改或验证范围内。

## 验证结果

- manifest SHA-256：`2424B512AD67D5D428EC5F1DA7AA7070F8D98427268A834013457E02345E2553`
- manifest 文件：`13/13 PASS`
- 隔离测试：`25/25 PASS`
- 真实 PowerShell 子进程探针覆盖已注册、运行中、停止、文件锁与未注册服务路径。
- 真实只读 preflight：`PASS`，`apiUnchanged=true`，`workerCalls=[]`。

## 操作边界

本次未停止、启动、安装或复制真实 Worker 服务文件，未写数据库，未调用 API，未创建同步 run。真实切换仍需项目经理另行明确派发。
