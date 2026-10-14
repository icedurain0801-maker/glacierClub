# 前端实际漂移与修复状态

Status: CANDIDATE_AND_SCHEMA_PARTIAL_PASS_CUTOVER_BLOCKED

独立候选验收 v067：6/6 一次 PASS。六表及两项关闭配置的独立只读 v068：3 组 PASS、运行身份组 FAIL，正式报告已完成（`.tests/2026-10/2026-10-10/v068_six_intents_independent_readonly_qa.md`）。结果原件 SHA256 `c525c833ee36b54a05d6e7794482836935df9b67cc74240ddc48ed6bb361110d`，运行身份原件 SHA256 `bf411d001142d9d7ffea85e5b576ac84d445dc5f47f51f791ba37dba4cb7d373`。这些都是限定结果；本轮没有完成服务切换或境外定时恢复验收。

## 真实基底漂移

QA 18:35:23、开发 18:36:06 均确认前端服务从 v214 指向变为 `release-20261010-overview-risk-order-v155`。wrapper PID 19104 → 11268，旧 Node 18460 消失，新 Node 23356/createUTC `2026-10-10T10:34:53.143482Z`。XML SHA256 变为 `f5ef0b3e3e5fa2a5f503d5843c1f36661557588ad7c56781a5f92ea518a99480`。

开发 `base-guard-after-qa-drift.json` 返回 `BLOCKED_BASE_DRIFT`、exit 1，准确指出 frontend service/XML/Node 三项身份变化，所有切换继续中止。这是真实变化，与先前日期格式/换行误报不同。

开发未操作此次前端发布，不能据 release 名字中的 v155 断言回退，也不能把新指向自动接受为已批准基底。已请项目经理核实际发布结果与新的批准基底。

## 只读归档

观测新版完整 34 文件只读归档在仓库根 `.temp/risk-normalization-20261010/current-v097-validation/observed-frontend-drift/`，ZIP SHA256 `f210b9d1dc52cf6e78a5580cee500435a2abf6a737314895c3b40a5b50c07f75`。原 XML、文件清单、源前后字节、ZIP读回均已验证。与 v214 相比仅 3 文件 SHA 变化：release manifest、首页 HTML、assets/app.js。该归档仅记录观测，不是新的发布许可或 loaded 证明；v097 manifest 不改写。

## 当前工作状态

| 工作项 | 状态 |
|---|---|
| 最新 API 统一候选与最小开发验证 | 已完成，6/6 PASS |
| 候选独立验收 | 已完成，6/6 PASS |
| 获准六表 + 两关闭开关 | 已执行，独立只读 3 组 PASS |
| Last Night 精确启用候选 | 已只读提取，见 v101，未启用 |
| 前端当前基底批准 | 待经理核此次切换，旧 guard 已阻断 |
| 旧任务/手工禁止再起 | 未完成 |
| 实际准入、排空、双 gate 与 main/loaded | 未完成 |
| Translation 回退或受控 stop-only | 未完成 |
| 真实境外定时同步恢复 | 未验收 |

两个 intent 开关保持 false，无回填、真实采集、AI、通知。只读提取的历史 completed run 和库存 feed 不能当本次真实恢复证据。
