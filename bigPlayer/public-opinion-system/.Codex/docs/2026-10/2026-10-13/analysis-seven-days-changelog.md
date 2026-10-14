# 自动分析仅近7天

- 用户要求：仅处理近7天内容。
- PUBLIC_OPINION_ANALYSIS_LOOKBACK_DAYS=7，按内容published_at滚动7×24小时。
- server/src/services/analysisWindow.js统一求时间交集；repository.js的claimAnalysisJobs、enqueueMissingAnalysis、countAnalysisJobs均套用限制。请求已有更窄范围时保留，不扩大。
- 旧数据、旧任务、完成结果均保留；超过7天不再领取，不写完成状态、不删任务。已开始批次允许收尾。
- 本机API/采集Worker/分析Worker新运行包及海外定时运行包已更新；海外共享排除清单重绑定保持门禁。
- 验证：时间窗口测试1/1；现役repository领取参数捕获确认滚动7天；可见Edge真实配置页/API200、TypeSafe启用、无脚本错误；API及两Worker均Running。
- 缩窄后采样待处理任务6353条：light pending5692，deep pending660，deep retryable1，数量随采集分析变化。
- 未提交/推送Git。修改文件：analysisWindow.js、repository.js、.env.example；验证见.tests/2026-10/2026-10-13/analysis-window.test.js、seven-days-live.json、seven-days-count.json。
