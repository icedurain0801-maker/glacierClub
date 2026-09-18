# v195 A2 历史 Worker 心跳退役：代码与只读回归验收

- 验收角色：测试负责人
- 结论：**PASS**。
- 范围：代码、测试替身与只读验证；未部署、未写数据库、未重启 API/Worker。

## 验收结果

- `heartbeatWorkerId()` 生成稳定 `worker:<WORKER_ID|hostname>` 身份，长度受 `varchar(160)` 限制。
- `leaseOwner` 保持 `${process.pid}-${crypto.randomUUID()}`，与稳定心跳身份分离。
- 历史 PID+UUID 格式记录仅在存在更晚 `worker:%` 稳定心跳时被过滤；没有后续稳定心跳的旧活跃实例仍可见，兼容滚动升级与回滚。
- MariaDB 同形 SQL 测试覆盖旧身份退役过滤。

## 回归

执行：

```powershell
node.exe --test worker/test/workerUnifiedSchedulerSeam.test.js worker/test/schedulerRepositoryAdapter.test.js server/test/repository.test.js
```

结果：`157/157 PASS`，`0 fail`。

## 未执行项

- 未部署 A2。
- 未修改或清理既有心跳行。
- 未操作生产数据库、API 或 Worker 服务。
