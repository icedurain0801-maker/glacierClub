---
status: implemented
scope: frontend
---

# v019 运行记录深链时序修复

## 变更

- `updateUrl()` 在详情尚未恢复时保留 `pendingRunId`，不再因首轮 `load()` 清除深链参数。
- `restoreExpanded()` 继续在首轮列表加载后消费同一个 `runId`，确保直接打开详情 URL 能展开目标 Run。
- 增加 URL 保留与消费顺序契约测试。

## 验证

- `node --test ..\\admin\\PublicOpinion\\assets\\collection-runs.test.js`：4/4 通过。
- `node --check ..\\admin\\PublicOpinion\\assets\\collection-runs.js`：通过。
- `git diff --check`：通过。
- 未重跑真实 Run，未写入真实数据，未修改 schema 或 gate。
