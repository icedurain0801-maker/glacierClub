# 海外原子页下游重复入队修复

Status: isolated-candidate; production NO_GO

## 复现与修改

- 新增 `worker/test/overseasBigPlayerDownstream.test.js`，修复前两项测试均失败：原子海外页被再次入队。
- 修改 `worker/src/worker.js` 的 `processPersistentAnalysisJobs`：仅当海外 `bigplayer_h5` 且 `overseasAtomicPageJobs === true`，跳过页内容的二次 light 入队；队列领取、分析、deep 升级与告警不变。
- 国内、其他平台、非原子海外仍走原来的内容入队逻辑。
- 本修复依赖 PageStore 的 `beforeCommit` 真实接入 PageJobs；不是独立生产启用开关。

## 验证与限制

新增测试及页链最小联合回归 9/9 PASS；加入具体网络校验后联合 12/12 PASS。旧 v058 冻结快照保持不变；本修复属于下一候选，须新冻结后独立 QA。
不改现役配置、进程或数据库，不删除旧方案，不 push/发版。合同生命周期、当前观察恢复、完整 drain 和第二源修复仍未完成。
