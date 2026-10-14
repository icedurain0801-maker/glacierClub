# TypeSafe Python 舆情决策客户端

日期：2026-10-13。状态：独立客户端已实现，隔离验证通过；真实平台联调待配置 BCGPT_API_KEY。未提交、未推送、未部署。

## 范围与协议

- 根目录新增 `sentiment_evaluator.py`；不接线 Node.js API/Worker，不写业务数据库。
- Python >=3.10，依赖 httpx（`python -m pip install httpx`）。
- POST `https://chat-test.q1.com/v1/systemone`，Bearer 仅从 BCGPT_API_KEY 读取；模型 `decision-model-preview`。
- 三道问题使用 choice / noul / choice，不误用 boolean、null 或 score。此次没有评分问题，故不额外发送 score。
- 复用异步 HTTP 连接池；跨批次信号量10；每次请求总超时3秒；首次失败后最多重试两次，退避0.5秒、1秒。
- 网络/超时、429、5xx重试；其他HTTP错误、无效JSON/缺字段/非法枚举/非有限概率立即报错；不泄露原始响应或Token。
- 批量返回顺序与输入一致；任一错误显式抛出，并取消等待其他批量任务。空列表返回空列表。

## 业务路由

按用户本次指定的顺序，不修改现役v11：

1. 原判L2且confidence<0.6→L1；原判L3低置信→manual_review。
2. 原判L3且触发项none→L2。
3. 原判L2/L3且noul<0.5→L1。
4. 返回final_level/status/confidence/raw_level；低置信L3即使后续降级，保留manual_review。

这是一份用户指定的三问版v11客户端：emergency_trigger仅涵盖提供的三类选项，不表示完整复刻现役R1–R14/U3–U5。用户本次明确的L3降级顺序与现役已验证紧急等级保留策略存在差异，已在客户端注释中说明。首个抽卡用例按用户明确预期L1编写提示，但真实模型语义表现必须实际联调后确认。

## 验证

- `python .tests/2026-10/2026-10-13/test_sentiment_evaluator.py`：11项通过，覆盖协议、四用例模拟返回、边界/组合降级、非法返回、缺密钥、总超时、退避/最大次数、并发10、顺序与失败取消。
- 可见Edge浏览器打开本机隔离入口、点击运行：四项模拟用例显示4/4通过。证据为同日期 `.tests` 下 `typesafe-client-browser.json`、`typesafe-client-browser.png`。
- `python sentiment_evaluator.py`：当前未设置 BCGPT_API_KEY，预期明确提示并退出码2，不调用外部服务。
- Python AST语法校验及指定文件空白检查通过。
- 未调用真实TypeSafe，不消耗公司额度；未验证平台实际响应协议与模型四用例判定。模拟用例通过仅证明请求/解析/路由链路。

## 使用

设置环境变量 BCGPT_API_KEY（不提交密钥）后执行 `python sentiment_evaluator.py`，会实际调用四条典型文本并打印逐项结果；全部达到预期退出0，有判级偏差退出1，调用/协议错误退出2。

其他Python服务通过 `async with SentimentEvaluator() as evaluator` 使用 `await evaluator.evaluate(text)` 或 `await evaluator.evaluate_batch(posts)`。
