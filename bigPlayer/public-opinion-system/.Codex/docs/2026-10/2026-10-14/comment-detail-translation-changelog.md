# 评论原帖与境外翻译修复

Status: released

## 原因与方案

截图评论 3881284 的原帖 1604033 已存在，线上详情 API 也返回 originalPost。前端把所属原帖追加在来源、分析和评论之后，用户打开侧栏时看不到。调整为评论正文之前展示，继续沿用按社区、来源、账号鉴权的原帖查询。

采集正文包含图片 URL；翻译器直接把它当文字调用模型，浪费额度，可能空响应或返回无意义内容。前端又把 pending/running/retryable 都显示为“生成中”。翻译器剔除媒体链接与 HTML 后再翻译；仅媒体内容通过现有租约完成为零用量无文字结果。页面明确显示排队、生成、等待重试、失败及额度不足。已完成但没有文字的内容也不显示生成中。

翻译工作进程批次以最多 3 个默认并发执行，领取租约覆盖批次最坏超时和重试。每日调用预算依旧共享且每次请求必须预留额度。保持 OVERSEAS_BOUNDED_VERIFICATION_HOLD 不被自动领取。打开的详情每 15 秒只在有文字且 pending/running 时刷新，保留滚动位置；关闭或切换详情通过序号失效旧请求。

## 文件

- `../admin/PublicOpinion/assets/content.js`：原帖位置、状态、详情译文刷新。
- `../admin/PublicOpinion/assets/alert-detail.js`：共享文字判定与翻译状态。
- `../admin/PublicOpinion/content.html`：本页脚本版本。
- `server/src/integrations/aiTranslator.js`：剔除媒体，无文字零调用。
- `worker/src/translationWorker.js`：有上限并发与批次租约。
- `server/src/db/repository.js`：保留人工 hold 的领取排除。

## 发布

从切换前实际服务包复制后只叠加本轮文件，保留之前已上线的分析及情绪百分比改动，未部署工作区无关改动。未运行迁移，不删业务数据，不调整每日 5000 次预算。

- API: `C:/ProgramData/PublicOpinion/releases/api-release-20261014-comment-translation-r1`
- 翻译消费者: `C:/ProgramData/PublicOpinion/releases/translation-release-20261014-comment-translation-r1`
- 前端: `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-comment-translation-r1`

前端/API manifest 通过；翻译包记录独立文件哈希并验证入口依赖。切换了上述三个服务；原 XML 和包保留。采集、分析及独立 Last Light 定时任务未重启。移除了消费者配置中的历史一次性 priority job。

## 验证

- 翻译器、翻译服务、Worker 原有 32 项测试通过。
- 新增 4 项：仅媒体零预算、混合文字剔除图片、各任务状态文案、并发上限与租约。
- 翻译仓储 3 项租约/事务测试通过，共 39 项不同用例。
- 外网真实 Edge 页面：原帖为第一个详情模块，3881284 所属 1604033，Morning -> 早上好；评论显示无可翻译文字，页面无 JS 错误。
- 补充浏览器验证：将真实详情响应的翻译字段在浏览器内模拟为 pending -> completed，15 秒刷新后显示中文；完成及关闭后停止轮询，仅 2 次详情请求。真实请求跨社区详情返回 404，帖子详情 originalPost 为 null。证据 `comment-detail-refresh-browser.json`，无业务写入。
- 实际执行 5 项指定任务，全部 completed，包含上述两项及 Last Light 3 条评论；翻译实际入库，不仅是入队。
- 恢复 4 条历史媒体内容空响应失败任务为 completed，该次调用预算 850 -> 850；5 条 hold 保持不变。

证据位于 `.tests/2026-10/2026-10-14/comment-detail-live.json`、`comment-translation-real.json`、`translation-recovery-status.json`、`comment-detail-live.png`。

## 限制

纯图片/视频不做 OCR。后台继续按每日预算处理历史积压，09:19 状态为 623 pending、1 running；其他历史真实翻译失败保留失败状态，不能宣称所有历史记录翻译已完成。源文本变动后仍按 fingerprint 重新翻译。
