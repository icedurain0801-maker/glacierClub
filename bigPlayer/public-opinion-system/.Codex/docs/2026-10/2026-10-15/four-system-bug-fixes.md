# 四项系统测试缺陷修复

Status: 用户确认后四服务已切换，现役真实接口与浏览器验收通过。

## 修复范围

| 缺陷 | 根因 | 修复 |
|---|---|---|
| 分析进度 504 | 全局孤儿任务逐行关联约26万任务，超出代理30秒上限 | 物化非空内容主键集合，保留孤儿计数和完整性告警 |
| 统计/筛选慢 | 来源索引驱动随机回表，读取全社区分析JSON，重复风险计数 | 宽范围聚簇扫描、覆盖索引先筛风险候选，仅读取需要的审核JSON，同响应复用相同计数 |
| 提交/执行差8小时 | 默认CURRENT_TIMESTAMP为本地时间，执行路径为UTC | 新任务created_at/requested_at显式UTC；历史异常返回null、raw_time_fields和中文提示，不猜测历史时区 |
| 等级与原因矛盾 | 现役L1跳过独立复核，只生成解释 | L1/L2/L3独立复核；同次更新等级、原因、情感及概率；缺失/失败进入重试，保留紧急原文证据校验 |

## 验证

- 本轮组合回归57项全部通过，另候选性能查询5项全部通过。
- API、Worker、AnalysisWorker及前端4份候选运行包均通过现有依赖闭包、语法、SHA-256 manifest验证。
- 真实数据库只读对照：固定时钟、同一快照，两社区统计/进度/中性数量共6组全部相同。
- 真实连接池统计超能832ms、Last Light836ms；进度分别3706ms、1925ms；中性计数1146ms、1162ms。
- 对照事务单连接串行且受同时DB负载影响：超能统计86.347→4.957秒，进度44.317→6.699秒，中性23.4→1.69秒。不得将该串行对照直接与HTTP并行时延混用。
- 浏览器：工作区合成样本“已经尽力”显示正常/中性96%/无需处理，原因与等级一致；候选前端历史错时任务详情显示警示及原值，无控制台错误。合成接口不作为真实接口性能证据。
- 正式托管浏览器此前被客户端阻拦API，用户日常浏览器可用；本轮隔离浏览器不等同他人电脑正式端到端验收。

## 候选与回退

候选目录为仓库根 `.temp/four-fixes-candidate-v2/`，由当前服务XML解析现役quality-config版本生成，8个文件overlay；没有携带工作区无关质量/评论上下文改动。各角色原始release记录在overlay-manifest.json，切换前须再次核对XML及运行包哈希。

运行时最小范围：API repository三性能方法、UTC任务写入和时间读取兼容；Worker repository及schedulerRepositoryAdapter UTC；AnalysisWorker的TypeSafeAnalyzer/TypeSafeUrgentReview；前端collection-runs时间提示。保持现役模型配置，不引入模型替换。

## 已知限制与未执行

- 未推Git、未提交BaaS，未重判历史样本，未补发钉钉通知。
- 未删除134927条历史孤儿任务，继续完整报告告警。
- 历史提交时间缺少写入时区来源证据，因此只隐藏被执行时间证实不可能的字段；排队未开始且无锚点的历史时间保持原样。旧数据与新UTC数据短期仍可能影响created_at排序，本轮不猜测回填历史。
- AI独立复核不能保证模型永不误判；本轮防止旧链条跳过L1复核及保留旧情感造成的矛盾，真实历史内容需有范围定向重审。

## 证据

测试：`.tests/2026-10/2026-10-15/four-fixes-final-tests.txt`、`four-fixes-candidate.test.cjs`。
性能：`query-performance-after.json`、`query-performance-final-comparison.json`。
浏览器：`hosted-system-browser/four-fixes-ai.png`、`four-fixes-time.png`及对应DOM。

## 现役切换与验收

用户弹窗确认“切换并继续验收”后，四个服务切换至各自release-20261015-four-fixes-<api/worker/analysis/frontend>-r1，保留原quality-config版本与XML备份可回退。API/前端健康检查通过，四服务持续Running；切换后再次验证四运行包manifest通过。

- 外网真实统计：超能1100ms、Last Light996ms，HTTP200。
- 正确参数的进度接口：超能5437ms、Last Light2793ms，HTTP200，原504消失。
- 真实历史任务b4d53815-c80b-4fe2-8165-9b78df129f4b：提交异常字段null、原值保留、UTC开始/结束不改。浏览器实际显示提交“-”、14:02:34开始/14:09:54结束及中文历史时区提示。
- 真实内容页面登录成功，列表正常；中性筛选返回54条且渲染正常；任务详情正常显示48条已加载新增内容，控制台无错误。
- 使用现役TypeSafeAnalyzer、实际模型接口，对“已经尽力”进行无数据库写入验证：L0、中性，原因“没有发现任何具体问题或异常，属于正常讨论范围”。模型请求启用TLS证书校验及系统CA。历史分析行没有自动重写。
- 全量读取审计复用了旧测试脚本，其中不适用platform参数、缺少period等请求产生400；未实现navigation为501，旧来源登录状态为404。这些不计为本次四项修复通过证据，也不宣称所有功能无缺陷。

现役证据：four-fixes-live-api-audit.json（原始审计）、four-fixes-live-targeted.json（正确参数进度及任务时间）、four-fixes-live-ai.json；浏览器four-fixes-live-content.png、four-fixes-live-neutral.png、four-fixes-live-time.png及DOM。
