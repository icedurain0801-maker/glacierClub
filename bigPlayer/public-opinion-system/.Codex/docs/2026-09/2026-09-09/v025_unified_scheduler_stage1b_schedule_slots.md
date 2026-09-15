# 统一来源调度：阶段 1B 时刻槽纯函数

- Status: ready_for_qa
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 新增 `worker/src/scheduleSlots.js`，只负责北京时间固定时刻槽计算，不读写数据库、不调用 Worker 或连接器。
- 新增 `worker/test/scheduleSlots.test.js`，覆盖边界、频率、漏点、窗口和生效时间。
- 未修改现有 Worker、Repository 或历史调度入口。

## 逻辑

- 输入接受 UTC `Date` 或 ISO 时间，输出统一为 UTC ISO 字符串。
- 业务时区固定 `Asia/Shanghai`，每日锚点固定北京时间 02:00。
- 支持 900、3600、21600、43200、86400 秒频率。
- 到期槽始终按 `02:00 + k × frequency_seconds` 计算，不引用任务完成时间。
- 错过多个槽时只返回当前时间之前最近一个未处理槽。
- `schedule_effective_at` 为排他边界，只处理严格晚于生效时间的槽。
- 02:00 首槽返回北京时间昨日 `[00:00, 24:00)` 对应的 UTC 窗口，其他槽使用增量窗口 `null`。
- 同时返回下一个未来槽；跨日、跨年和闰日通过 UTC 毫秒运算处理。

## 验证

命令：

```bash
node --test --test-concurrency=1 worker/test/scheduleSlots.test.js
```

结果：`8 passed, 0 failed`。

测试负责人首次盲审发现缺失必填 `now` 会落入 Unix epoch。R1 先补充缺失 `now`、`null` 与非法 ISO 三类 fail-fast 用例，得到 `7 passed, 1 failed`；随后将 `timestamp()` 区分为必填和可选参数，修复后恢复为 `8 passed, 0 failed`，不再产生 1970 伪槽。

## 未接线边界

- 尚未接入 `worker/src/worker.js`、Repository、数据库任务表或来源租约。
- 尚未执行真实迁移、数据库测试、Worker 或外部采集。
- 当前固定 UTC+08:00 表达现代 `Asia/Shanghai`；未覆盖 1991 年以前的历史夏令时规则。
