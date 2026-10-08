# TapTap 增量游标续跑修复

日期：2026-09-20

状态：开发自测完成，待测试负责人验收

## 变更范围

- `worker/src/worker.js`：TapTap `owned_content` 的 incremental 同步改为与其他同步阶段一致，使用已领取 checkpoint 的 `cursor`。不再在每轮开始时将其强制置空。
- 保留 `SYNC_PAGE_BUDGET=20` 和预算耗尽时以 `idle` 状态保存安全游标的既有行为；没有扩大单轮抓取规模。
- `worker/test/worker.test.js`：覆盖两轮 20 页同步。第一轮保存 `from=200`，第二轮从 `from=200` 起步；断言 400 条内容均为唯一新增。另覆盖 TapTap 回填、其他平台增量及 TapTap 评论游标均保持原有 checkpoint 续跑语义。

## 自测结果

```powershell
node --test --test-name-pattern "TapTap 增量 owned_content 在页预算耗尽后从 checkpoint 游标续跑且不重复新增|TapTap 游标续跑不影响回填、其他平台和评论游标" worker/test/worker.test.js
# 2 passed, 0 failed

node --check worker/src/worker.js
node --check worker/test/worker.test.js
git diff --check -- worker/src/worker.js worker/test/worker.test.js
# 均通过
```

## 验收建议

1. 在隔离或受控测试环境为 TapTap `owned_content` incremental 准备一个有 20 页以上数据的 checkpoint。
2. 首轮运行到页预算耗尽，确认 checkpoint 为 `idle` 且保存非空 cursor（示例：`from=200`）。
3. 让下一次正常频率触发运行，确认首个 connector 请求携带上轮 cursor，且已采内容不产生新增记录。
4. 不执行真实服务更新、真实补跑、发版或数据库操作；这些动作仍需独立安全预检与授权。

## 风险与限制

- 本修复只解决已确证的 TapTap incremental cursor 归零问题；不改变数据源侧分页、账号授权或网络故障处理。
- 尚未在真实服务或真实数据上执行，不能据此宣称当天采集已经恢复。
