# Facebook 中文页面图文采集兼容

Status: 已获用户单独发布授权，登录采集服务已切至 facebook-layout-r2；Last Light 同一次同步恢复中，尚未验收入库与 AI 分析。

修复文件：login-session-service/src/adapters/facebookBrowser.js。支持带年份的中文完整发布时间，仍拒绝相对时间和不合法日期；等待 Facebook 挂载动态内容，处理中文展开、全部评论和查看原文按钮，仅关闭浏览器通知偏好提示，不操作安全验证码。作者优先读取标题链接，过滤隐藏副本、头像和小图标，评论与回复按真实时间链接及父 ID 分离。时间节点被 Facebook 替换时限时跳过，避免 30 秒等待导致内部错误。已登录的真实独立浏览器可在服务切换后核验并接管，无需重新输入密码。

隔离验证：31 项 Node 回归通过；facebook-chinese-layout.cjs 3 项真实 Chrome 回归通过，覆盖中文时间和窗口、评论原文和纯图、回复父 ID；facebook-external-browser.cjs 7 项桌面浏览器隔离回归通过。实际 Facebook 只读采集已验证窗口内 4 条帖子共 8 张图，评论样本含英文原文及纯图；不将这些只读结果视为已入库。

发布：仅变更登录服务，API、Worker、AnalysisWorker、前端保持原版本。现役三项 HTTP 健康为 200。原任务 69eb1dfe-0234-4b39-be36-f1286fc39d58 保留北京时间 10/19 00:00 至 10/20 16:59:25.638 的窗口，未重复创建任务，恢复动作记录审计。任务恢复第一次遇到动态节点超时，进一步修复并复验后发布 r2。

历史日志曾误判为现役 Worker 路径故障，已核对当前进程和真实 E 盘环境文件，未修改或重启 Worker。当前同步进度另行补充。

实际验收更新：r2 已实际入库 4 条帖子、8 张图片，前两条图片分析证据 complete；真实内容管理详情显示正文、中文翻译、AI 分析原因及可正常加载的附图，截图 facebook-real-post-detail.png。任务以 partial / FACEBOOK_REPLAY_LIMIT 结束，尚未进入评论阶段。已准备 r3 时间窗口停止修复及现役 Worker 的 3 处精确变更，修复同账号评论/回复并发、恢复时跳过 unchanged 帖子的评论；等待用户批准扩大 Worker 切换范围。

新增 worker/test/facebookSerialRecovery.test.js 验证两条 unchanged 帖子仍检查评论且并发峰值为 1。相关 15 项 Worker 回归通过。额外 collectionRecovery.test.js 有 2 项既有 SQL 契约失败，与本次改动无关，未修改该并行模块，未将其计为通过。

用户已批准扩大切换范围：Worker 已切至 facebook-serial-worker-r1，仅对现役文件做 3 处精确替换，未覆盖工作区其他并行改动；登录服务切至 facebook-layout-r4。实际已保存 37 条评论及 23 张评论图片，加上 4 帖 8 图合计 41 内容、31 图。多数模型分析已完成，4 条暂时性 HTTP 500/复核请求失败已受控重试一次。真实纯图评论详情展示附图、原帖独立说明区及引用图片文字的 AI 原因，截图 facebook-real-image-comment-detail.png。

末页读取以“所有评论”、无更多按钮、无加载指示、滚动到底及两轮节点稳定同时判断；没有这些证据不标记完成。恢复期间已安全暂停原 run，并保留相同窗口、内容去重和审计后继续。当前仍等待最终收尾，不宣称全量完成。
