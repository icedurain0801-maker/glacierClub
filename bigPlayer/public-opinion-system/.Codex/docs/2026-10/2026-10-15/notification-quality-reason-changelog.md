# 通知详情定位与优质推荐理由修复

Status: 已发布并验收
日期：2026-10-15

## 问题与修复

1. 旧通知链接只有 contentId，页面可能沿用上次选择的社区。scope.js 在初始化社区前通过正常鉴权的内容详情接口解析所属社区及北京时间发布日期；新通知链接直接附带社区与发布日期。无权限时拒绝访问，不退回当前社区。
2. Last Light 10/14 帖子1603483、1603481的历史推荐理由为 `TypeSafe结构化质量及推荐判断`。根据完整原文生成具体推荐依据，带连续原文引用，分别更新对应 po_quality_candidates 与 po_analyses 的 quality_reason。评分、推荐标记和审核状态未修改。两条内容已同步BaaS，相关优质候选元数据已刷新。
3. 优质管理页面错误读取风险 analysis_reason。列表及详情改读 quality_reason，并标为“AI推荐理由”；缺失或历史占位时显示“推荐理由待生成”，不以“没有负面”替代推荐价值。
4. 模型容易把清单多段内容拼成伪引用。生成器v2提供真实短片段，让模型选择片段下标；非法下标、超过60字符或非原文连续引用均拒绝。新版本进入分析缓存键，避免沿用旧解释缓存。模型异常维持已有分析重试机制，不改变推荐判定。
5. 推送入口和模板拒绝空白、占位推荐理由。已完成分析且理由有效的内容可先发送；理由缺失的优质任务保持等待，修正后可继续，已投递内容仍去重。关注级及紧急推送不被优质理由阻塞。
6. 浏览器验收发现优质列表将带时区时间直接传给MySQL，导致10/14显示0条。API统一用既有 parsePublishedBoundary 转成UTC，非法、反向窗口返回400。修复后线上正确显示2条。

## 修改文件

- `../admin/PublicOpinion/assets/scope.js`：旧详情链接解析。
- `../admin/PublicOpinion/assets/alerts.js`：正确显示推荐理由。
- `../admin/PublicOpinion/*.html`：scope版本同步；alerts缓存版本更新。
- `worker/src/collectionDingTalk.js`：链接携带社区日期、推荐理由推送门禁。
- `server/src/integrations/typeSafeQualityExplanation.js`：真实证据片段选择和v2版本。
- `server/src/app.js`：优质查询UTC日期边界。
- `worker/test/collectionDingTalk.test.js`、`server/test/typeSafeQualityExplanation.test.js`、`server/test/qualityPublishedBoundary.test.js`、`.tests/2026-10/2026-10-14/board-short-url.test.cjs`：行为回归。

## 验证

- 50项自动测试通过，证据：`.tests/2026-10/2026-10-15/notification-quality-reason-tests.tap`。
- 语法及 git diff --check 通过；Git输出仅有既有换行转换提示。
- 四个发布包依赖与manifest校验通过。
- 浏览器：旧contentId链接从国内会话自动定位Last Light、10/14并展开1603481详情；优质列表10/14显示2条具体推荐依据；详情显示1603481、VKD_VD、5493828及完整中文翻译。
- 截图：`.tests/2026-10/2026-10-15/quality-reason-live.png`。
- BaaS证据：`lastlight-quality-reason-cloud.json`，2条内容写入、36条元数据刷新。
- 前端health返回200；API、前端及分析服务运行中；推送计划任务最近退出码0。

## 现役发布

按用户已授权的直接修复发布执行，以现役包做增量修改，保留旧版本便于回滚。未覆盖工作区其他未发布修改。

| 运行部分 | 新版本 |
|---|---|
| API4320 | `C:/ProgramData/PublicOpinion/releases/release-20261015-quality-reason-api-r4` |
| 分析Worker | `C:/ProgramData/PublicOpinion/releases/release-20261015-quality-reason-analysis-r2` |
| 推送每分钟任务 | `C:/ProgramData/PublicOpinion/releases/release-20261015-quality-reason-sender-r2` |
| 前端3001 | `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261015-quality-reason-front-r2` |

API、分析、前端短暂重启。登录、采集、翻译服务未重启，数据库结构未变更。旧配置备份保存在仓库根`.temp/opinion-push-cards/`。

## 使用限制

钉钉已发送的旧Markdown消息不会随数据库修正自动更新。本次没有重新推送1603483或1603481；已有投递日志继续防止重复发送。历史数据补修只覆盖这两条，其他旧占位理由由推送门禁拦截，未执行批量历史重分析。

## 本次自测复盘

推荐理由必须分别验证“内容价值解释”“真实原文证据”“页面及推送取值”。只有生成接口测试通过不足以证明用户看到正确文案；应通过实际社区、日期筛选和详情验证。带时区日期查询必须在API统一归一化后才交给数据库。
