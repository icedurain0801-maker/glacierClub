# 单帖抓取分析
Status: released_with_facebook_live_validation_blocked

用户已确认标题先选择候选帖子，抓取全部可见评论及回复，不受近7天限制。入口位于抓取内容管理下方，single-post-analysis.html。境内支持BigPlayer、TapTap；境外支持BigPlayer、Facebook。

采用独立持久化工具任务，API仅负责提交、查询和下载，Worker串行执行，不把工具评论写入常规内容及告警队列。复用已有社区采集凭据，不接受客户端传凭据或任意请求地址。标题候选必须属于授权采集源，分析只接受服务端保存的候选；权限沿用内容导航并要求管理权限，社区范围及任务创建者双重校验。

详细模式逐批分析每条评论的情感、议题、依据和关键观点，服务端汇总真实计数、时间趋势、议题和关键发言人；指定模式逐条判断是否匹配要求并给出原文依据。结果页面和Excel均保留评论ID、发布人平台ID和原文。AI输出必须通过索引和引用原文校验，不编造数量、不可见图片或额外用户信息。批量限流，分页循环、任务时长、数据量设保护；任何截断、评论不可见、平台排序/权限限制明确标记为授权范围或部分结果，不能宣称抓取了平台全部评论。

任务持久化，重启时中断任务显示失败可重新提交；不改现有自动分析和通知。Excel为真实xlsx，包含报告、逐条结果和原始评论，所有文本为字符串单元格防公式执行。


## 2026-10-20 交付与验证

已按用户“改完直接更新”的授权切换本机现役，不推Git、不提交BaaS。API和Worker运行包为release-20261020-single-post-api-r3、release-20261020-single-post-worker-r3；前端为release-20261020-single-post-frontend-r2；登录服务为login-session-20261020-single-post-r2。四项服务检查均Running；运行包基于切换当时最新版本准备并校验基线，保留旧版可回退。

- 72项隔离测试通过，相关JavaScript语法检查、git diff --check通过。
- Chrome隔离接口点击验收通过：区域/平台联动、候选选择、两种分析模式、报告、分页、Excel下载、长ID和XSS转义。
- 真实BigPlayer帖子930007详细分析：4条评论完成，3正面、1负面。
- 真实TapTap帖子859818931831967692指定分析：3条一级评论及1条回复完成，4条中匹配3条。
- Excel通过ZIP/XML解析，字符串ID保持精确，内容不会解释为公式。
- 现役域名Chrome入口可打开，无pageerror；新浏览器无SSO会话时显示登录面板，未登录API返回401。此项不等同于真实登录后的全流程验收。MCP已有浏览器连接仍报Transport closed。
- Facebook真实定位测试3ccc179a-6351-49d8-aded-9e93a6f0538a失败，错误LOGIN_FAILED，发生于登录授权检查阶段；尚未完成Facebook真实抓取验收。不得宣称三平台全部通过。需恢复该社区登录授权后重试；未绕过登录、未反复尝试账密。

工具详细分析复用gpt-5.6-luna，结构化字段和原文引用校验失败最多重试一次；不替换常规TypeSafe流程。默认保护1000页、20000评论、30分钟，达到限制或读取中断明确标记部分结果。仅分析文本，长评论分析前1600字符，Excel保留已抓取完整原文。

相关实现：server/src/services/singlePostJobs.js、singlePostExcel.js、worker/src/singlePostRunner.js，前端../admin/PublicOpinion/single-post-analysis.html及assets/single-post-analysis.js/css；路由在server/src/app.js，任务轮询在worker/src/worker.js，平台扩展位于连接器及登录适配器。迁移048_single_post_jobs.sql已执行。测试任务保留独立表审计，不写普通内容、告警和通知队列。

测试记录位于.tests/2026-10/2026-10-20/single-post/，包含tests.txt、real-results.json、live-browser-results.json、浏览器截图及真实Excel。


## 境外BigPlayer与布局修正

根据用户补充，境外可选BigPlayer和Facebook，境内仍为BigPlayer和TapTap。API输入白名单与前端同步，BigPlayer境外沿用当前社区账号及既有连接器，支持ID或标题，不修改其他平台限制。相关18项测试和Chrome隔离交互通过。

参考现有任务记录页补齐顶部24px/28px内边距、统一标题和社区筛选留白；表单卡片标题分隔、24px行距及28px列距、底部独立操作区。资源版本更新为20261020-single-post-layout-r2。截图settings-layout-r2.png已检查。

API候选release-20261020-single-post-overseas-api-r1仅变更singlePostJobs.js；前端release-20261020-single-post-layout-front-r1仅变更本页HTML、JS、CSS。运行包449/53文件校验通过；不改数据库、不推Git、不发布BaaS。
切换后API /readyz、前端 /healthz/frontend均200，服务Running。Chrome直接加载现役域名的真实静态资源，以隔离API响应完成两种模式、境外BigPlayer/FB输入联动与Excel点击验收，通过；对应live-assets-browser-results.json。此项不代表新增真实平台抓取测试。


## 顶部卡片与原型控件修正（用户截图反馈）

前一版误将顶部设为负边距铺满，未对齐概览页。现按概览页顶部规范恢复：主区22px/26px留白、顶部margin 0 0 18px、24px/28px内边距、8px圆角、同款阴影和标题字号；社区选择器使用同款嵌套结构。用户指出需求说明悬浮按钮不合理，明确覆盖新页模板默认保留要求，移除按钮、面板、事件、CSS和为其预留的页面空白，候选按钮恢复正常宽度。

仅更新single-post-analysis.html及其JS/CSS，资源版本20261020-single-post-header-r3。Chrome隔离点击校验包含无原型控件、顶部margin/radius/padding精确断言、两模式、境外平台、Excel下载。已人工查看settings-header-r3.png。前端运行包release-20261020-single-post-header-front-r1以切换当时现役为基线，仅3文件变化，55文件清单验证通过。切换后Chrome加载真实现役静态资源（隔离API）复验通过。未改API和数据库，未推Git/BaaS。
区域与社区选择器间距修正：仅本页将display:contents包装层改为inline-flex并增加12px gap，避免两个下拉框贴在一起；小屏可换行。更新CSS资源版本，前端包release-20261020-single-post-scope-gap-front-r1，仅HTML/CSS两文件变更，55文件清单验证及Chrome隔离点击通过，切换后现役静态资源浏览器复验通过。不改API/数据，不推Git或BaaS。
