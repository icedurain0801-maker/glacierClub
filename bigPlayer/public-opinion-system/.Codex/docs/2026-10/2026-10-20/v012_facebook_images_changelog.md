# Facebook 图文采集及图片证据分析

日期：2026-10-20

状态：已于北京时间 2026-10-20 14:44 发布 API、采集 Worker、分析 Worker、登录服务及本机前端。三项 HTTP 健康检查均为 200；安全暂停的 10 个根任务已全部恢复，pending=0。Last Light 已通过正常登录续期进入 Facebook 人工验证，尚未入队同步；真实同步结果另行追加。

## 变更逻辑

- 网页采集帖子、评论、回复自身正文和附图，按所属 article 隔离，排除头像、图标及小图；支持纯图片内容。
- 每轮以北京时间昨天 00:00 至开始时刻为固定区间，Worker 在首次领取时持久化；分页断点绑定网页、账号、范围和时间窗口，使用本条自己的发布时间。
- Worker 标准化、数据库存储及分析输入保留 media，图片变化影响指纹。
- 图片只从官方 HTTPS CDN 下载，禁止私网、非图片格式、无限跳转和过大文件；限制下载时长、模型并发和单条图片数。识别模型接收实际图片字节，不接收 Facebook 凭据。
- 保存图片文字及可见画面为独立 AI 证据，不改写玩家正文；结合正文执行现有初判与独立复核，纯图片不走空文字正常分支。
- 图片失败保留明确错误码，使用既有分析队列重试；批处理中失败条目不会生成正常结论。
- 内容详情及评论线程显示自身附图；图片读取失败显示提示。
- 旧 Facebook 来源在保存配置时可修复同来源、同社区账号的缺失默认关联；不借用其他社区账号。
- 补齐 API 和登录服务打包脚本中的 shared/facebookMedia.js 依赖。

## 关键文件

shared/facebookMedia.js；server/src/integrations/facebookImageAnalyzer.js；typeSafeAnalyzer.js；typeSafeUrgentReview.js；server/src/services/urgentValidation.js；server/src/db/repository.js；facebookBrowserAccount.js；worker/src/worker.js；login-session-service/src/adapters/facebookBrowser.js；loginSessionService.js；FacebookBrowserConnector；相邻前端 assets/alert-detail.js、content.js、content.html。

## 验证

- Facebook 图片专项 12 项通过，含完整日期悬浮解析、拒绝相对时间及真实帖子路径。
- 图文、Facebook 权限路由、评论语境、独立复核、落库闸门及队列相关回归 67/67 通过。
- 真实 Edge 浏览器、隔离接口及网页夹具 20 项通过，覆盖纯图片、评论附图隔离、头像排除、时间边界及悬浮时间、详情图片显示、账号社区隔离、分页、关闭及登录状态；现役候选资源也通过相同浏览器验证。
- 按现役 API/采集 Worker/分析 Worker/登录服务/前端分别制作候选包，避免带入工作区其他未发布改动；API 与 Worker 依赖闭包检查通过。
- 现有 gpt-4.1-mini 图片网关真实预检识别 TEST 7391 成功；该调用使用测试图，不是玩家数据。
- 语法及 git diff --check 通过。
- 发布后实际浏览器检查 lfy3001 概览可正常加载真实统计，未观察到页面异常或 HTTP 5xx。chat.q1.com 托管页仍为旧版 Facebook 配置，不能将本机前端发布描述为托管资源已同步；人工验证改用现役 club-opinion.q1.com 登录入口。

## 发布与同步记录

- 仅按五项各自现役基线合入本任务，保留其他已发布变更；各服务 XML 均有切换前备份。
- Last Light 默认账号缺失关联已修复，限定同来源、同社区账号；真实 Facebook 会话状态为 manual_verification。
- 本次尚无 Facebook 同步 runId、采集内容或图片分析结果，不将模型测试及网页夹具验证写成真实同步成功。

## 边界

图片保存当前平台 CDN URL 及持久 AI 识别证据，未引入新的图片存档服务；CDN URL 可能失效。不能验证真实 ID、发布时间或完整边界时保留失败/部分完成状态，不伪造完整采集。人工验证码必须由管理员完成。
