# 统一修复发布的实际阻断

Status: BLOCKED_NO_PRODUCTION_CUTOVER

2026-10-10 18:25 的只读结果明确：当前统一候选可以继续独立验收，但生产新链路没有上线条件。用户的 no-DDL、禁止真实抓取和付费 AI 等边界保持。

## 证据与影响

| 已确认对象 | 实际证据 | 影响 |
|---|---|---|
| 新分析/翻译 intent schema | 六张表全缺，analysis intent config 未配置、默认 disabled | 启用新链路会访问不存在的表，当前范围不允许 DDL，因此阻断 |
| 旧定时入口 | `BigPlayer Q1 Daily 02` 和 `BigPlayer Last Night Overseas Daily 02` 仍 Enabled | 未有技术控制阻止旧脚本再起，不能按控制方案已生效签收 |
| 现役 Translation 回退 | 原 release 406 文件枚举、0 可读，完整归档失败 | 回退包不完整，stop-only 防自动再起措施未实现，不能受控切换 |
| 常驻进程切换 | 实际 admission/drain、同连接双 gate、启动 pause/loaded receipt 未实现 | 磁盘 SHA 或隔离 cache 不能证明现役运行受控 |
| API 基底变化 | 18:06 auth persistence → 18:15 write compat → 18:20 status scope | 旧候选不能覆盖新修复；v097已最小融合当前基底，并加入立即 SHA/XML/PID/createTime 复核 |

缺失表的完整名称：

- `po_current_analysis_intents`
- `po_current_analysis_repair_records`
- `po_current_analysis_intent_audit`
- `po_overseas_current_intent_proof_audit`
- `po_current_translation_intents`
- `po_current_translation_intent_audit`

这些表缺失证明**本次新增链路未准备好上线**，不证明它们是用户原始境外采集故障的根因。原始故障是否仍涉及远端授权、网络、正文获取或定时执行，须由已授权的真实链路验收确认；当前没有这样的恢复证据。

## 已完成与责任边界

最新 API + 四树统一候选 v097 已冻结、开发 6/6 隔离一次 PASS 并交独立 QA，详见 v097交接。当前版本的授权持久化、expiry、probe、sync write compat 与 latest scope 均保留。未继续重跑旧矩阵或三站，未重启生产服务。

18:25:50 只读 HTTP 验证：外网首页 `https://lfy3001.dev.q1op.com/` 返回 200，本机 API `/health` 返回 200、数据库状态 `ok`。这只确认页面/API 可用，不能代签境内或境外采集成功。

当前反复拖延中已证实的问题是：开发候选、自测、现役部署与生产准备条件没有在同一份交付中闭合，且基底连续变化；“隔离通过”多次早于“可运行、可回退、可验收”。开发需要对这项交付闭环负责。现阶段不把未经实测的远端问题归咎为事实。

## 交接处理

开发完成最小候选和复现，测试负责人继续独立签候选部分结果；项目经理已收到精确阻断对象，负责统一发布基底与范围收口。禁止跳过现有边界强行启新链路。生产条件不成立时不切换，不把代码候选称为“境外已恢复”。

证据均在仓库根 `.temp/risk-normalization-20261010/current-v097-validation/`：`schema-readiness.json` SHA256 `d94a6422b2287006e1bf5294035f7e8f3f35b4be62c9fcda0d8c45827032e64b`；`health-readonly.json`；`base-guard-pre-qa-r2.json`；三份只读运行身份样本。schema 查询采用 READ ONLY 事务，仅 information_schema 表/字段，不输出凭据，不执行数据写入。
