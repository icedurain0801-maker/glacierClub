# Worker-only CLI 真实预检与授权 Apply 接线

状态：代码与隔离演练完成，待 QA；未运行真实预检或 Apply。

唯一入口 `scripts/windows-services/worker-only-controlled-cutover.js` 不再把
`--preflight` 作为常量输出。真实预检现按传入参数执行下列只读门禁：

1. 读取候选、Worker、API、snapshot 文件的 `lstat`，拒绝链接/reparse 路径；
2. 核对 Worker/API snapshot 哈希、非空 Worker manifest 的逐文件 SHA-256（必须含
   `worker/src/worker.js`）、候选 WinSW 固定 SHA-256；
3. 强制 Worker/API 目标为固定 `C:\ProgramData\PublicOpinion\services` 下的对应文件，候选 release 位于固定 releases 根；
4. 用 `sc.exe query PublicOpinionWorker` 执行 Worker 状态预检，并以只读
   `worker-readiness.js` 做 readiness；预检前后重新核对 API wrapper/XML 哈希。

`--apply --controller=real` 需要环境变量授权值和 `--confirm` 完全匹配；缺失时在
任何输入读取、controller 创建、服务命令前返回 `REAL_APPLY_UNAUTHORIZED`。匹配后才会
建立固定 Worker controller 并进入既有事务，失败仅由该事务恢复 Worker。API/3001 不在
允许命令集合中。

隔离 `--controller=fake` 使用同一 CLI 工件参数及同一 controller API 演练成功、预检、
停机、安装、启动、readiness、rollback 失败；所有场景断言 API 未变。

## 自测

```powershell
node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js
node --check scripts/windows-services/worker-only-controlled-cutover.js
```

结果：13/13 PASS。未执行真实服务控制、ProgramData 写入、数据库写入、补跑或发版。
