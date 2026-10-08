# v010 BigPlayer API 整合候选

## 变更范围

- 候选根：`.temp/candidates/v001-bigplayer-api-collector-20260923`
- 在 worker 增加 BigPlayer QA 前置门禁：默认关闭，只有显式 `BIGPLAYER_API_SYNC_ENABLED=true` 才允许开始同步。
- 统一调度能力层在门禁关闭时将 BigPlayer 标记为不可调度，避免 QA 前产生周期性同步任务。
- 新增纯内存整合 contract，覆盖昨日北京时间窗口、23 feed 既有回归、post/activity、评论回复、去重、幂等入库、异步 AI retryable、checkpoint 重启、国内/境外隔离、旧 HTML 链扫描、敏感字段扫描和零生产写入证明。
- 纳入 Discord/TapTap/Facebook 定向回归，不修改这些平台业务逻辑。

## QA 解除条件

以下条件全部满足后，才可在受控环境显式打开 `BIGPLAYER_API_SYNC_ENABLED=true`：

1. 候选根整合 fixture 全部通过；
2. Discord/TapTap/Facebook 回归全部通过；
3. manifest/checksum 无缺失、无 hash mismatch；
4. 测试负责人复测通过并明确解除 QA 门禁。

本轮未执行真实 Run、生产 DB、服务切换、Apply、发布或 push。

## 验证结果

```text
integrated fixture: 3/3 PASS
full minimal regression: 89/89 PASS
manifestFiles=685, missing=0, hashMismatches=0
checksumRows=686, checksumMismatches=0
manifestHash=52D0D15652C12CE44DA012414668B61E0C1CD425CCFD7CAB96CCC84E7DD9E765
checksumsHash=6EA62C31AE1FA24A59796D128DF2CF5E80C5BC66D67B9C4929307837303EBA41
```
