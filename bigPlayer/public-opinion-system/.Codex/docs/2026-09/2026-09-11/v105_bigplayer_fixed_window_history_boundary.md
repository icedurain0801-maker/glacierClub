# BigPlayer 固定窗口 legacy historyStart 边界修复

## 变更

- `worker/src/worker.js`：对 precreated/manual 的 `dailyBounded` run，运行时忽略账户 metadata 中遗留的 `historyStart`，仅透传本次 run 的 `publishedFrom/publishedTo`。
- `worker/test/worker.test.js`：补充 legacy `historyStart` 与固定窗口并存时的回归断言，确保连接器收到 `historyStart: null`。

## 验证

- `node --test worker/test/worker.test.js`：74/74 通过。
- 未修改 source 持久配置、频率或历史数据；未执行生产重跑。

## 状态

代码与定向测试已完成，待项目经理接收后再进入既定的单次生产验证流程。
