# v011 风险等级互斥模式

日期：2026-09-16
Status: ready_for_qa

- 新增 `public-opinion-system/shared/riskModes.js` UMD 共享谓词：`negative -> urgent`、`attention -> attention`。浏览器与服务端均使用同一份映射。
- `GET /contents`、`GET /contents/stats`、`GET /analysis/progress?scope=filters` 在有效 `riskMode` 时映射到 `severity`、清除 `sentiment` 并保留 Scope、平台、类型、时间、关键词等其他条件；未知模式或与显式 `severity` 冲突时返回 `INVALID_INPUT`，不静默扩大集合。
- `listContents`、`countContents`、`listContentTree` 均复用共享归一，保证带 `contentType`、账号或删除状态的树形读取也保持风险谓词。统计基础条件移除旧风险/情感条件，再分别计算帖子、评论、urgent 负面和 attention 关注级，避免维度交叉污染。
- 概览热榜两列按发布时间倒序各取 Top10，负面使用 `riskMode=negative`，关注级使用 `riskMode=attention`；指标键仍为 `negative`、`attention`。内容页与概览深链均由共享映射生成 `riskMode + severity`，负面链接不再携带 `sentiment`。
- AI 独立模块由本单子代理完成：`aiAnalyzer.js` 的 light/deep 采用 urgent -> attention -> normal 互斥单选，一般负向不会自动进入 attention；`PROMPT_SCHEMA_VERSION=sentiment-quality-context-severity-exclusive-v3`，只改变缓存标识。`analysisVersion`、`shouldDeep`、温度、关键词与调用配置不变；`aiAnalyzer.test.js` 为 `27/27 PASS`，无真实 AI 调用。
- 未按新定义重算历史 `severity`，不触发分析或回填。未修改共享 CSS、Worker、告警关键词、模型温度或其他无关业务行为；不 push、不发版。
- 负责人必要验证：服务端全量 `node --test --test-concurrency=1 test/*.test.js` 413/413 PASS；新增独立测试库API集成覆盖交集0、风险计数一致、normal/NULL/未分析排除、三类型同时间ID倒序Top10、类型筛选及冲突拒绝；共享浏览器/Node映射合同1/1 PASS。
- 测试文件：`server/test/repository.test.js`、`server/test/app.routes.test.js`、`server/test/aiAnalyzer.test.js`；`.tests/2026-09/2026-09-16/v153_shared_risk_modes.test.js`、`v153_severity_risk_browser.test.js`。方案3视觉回归脚本按已有urgent样本改为近30天取证、Top10为至多10条，不制造真实数据。
- 本机仅重新加载4320 API（PID3764），3001代理及常驻Worker不动；提示词源代码已更新，不通过重启Worker触发积压分析。真实浏览器风险计数/深链自测完成后直接交独立测试。
- 负责人真实浏览器自测：`.tests/2026-09/2026-09-16/v153_severity_risk_browser.test.js`，`1/1 PASS`（约153.6秒），覆盖 `7d/30d × 1440/375`；四组视口周期均验证负面/关注集合互斥、各不超过10条、统计与内容总数和概览指标一致、Top10与真实列表一致、深链保留范围且仅携带对应 `severity`、内容页实际点击另一风险卡后计数和URL更新一致，Console error/warn 为0。
- 独立测试负责人真实验收：`.tests/2026-09/2026-09-16/v153_severity_exclusive_risk_modes_browser_acceptance.md`，结论 `PASS（范围内）`。真实 3001 只读验收覆盖 7d/30d，概览指标与同窗内容 total 一致，两风险集合交集均为0，负面全为 urgent、关注全为 attention；30d 负面覆盖评论、动态、帖子及267字符长文本，深链范围和参数正确，方案3视觉无回归；AI合同27/27 PASS。
- 当前状态：开发负责人和独立测试负责人均已完成；结论为范围内 PASS。历史 severity 未重算，未触发分析/回填，未重启Worker，未push或发版。
