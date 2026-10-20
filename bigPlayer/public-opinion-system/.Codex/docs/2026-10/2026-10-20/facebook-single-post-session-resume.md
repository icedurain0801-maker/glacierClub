# Facebook单帖会话恢复修复
Status: completed

## 原因与证据
Last Light账号记录为authorized，登录服务记录却为session_expired/LOGIN_FAILED。真实本机浏览器仍存在且有c_user Cookie。旧连接器恢复时走默认账密登录，未复用external_browser；登录服务状态仅在内存，一小时引用到期或服务重启即丢失；适配器还会按闲置一小时清理共享浏览器上下文。

## 修复
连接器对缺失/过期引用使用resume_external。服务仅连接当前社区与账号绑定的本机浏览器，检查真实Cookie、导航到该社区并检查实际登录页面状态，通过才重新发放内部会话引用；不提交密码、不绕过验证码、不持久化明文Cookie。外部浏览器不再按闲置一小时作废，适配器清理只关闭自身标签，不关闭共享上下文。内部会话引用仍有到期机制，可通过真实登录检查恢复；撤销/人工验证状态不会被自动覆盖。恢复失败显示真实原因和管理入口提示。

真实重试还发现单帖页包含嵌套帖，定位可能取到其他帖子链接。已限定帖子链接匹配请求的目标ID。单帖allVisible模式没有时间窗口，缺少精确发布时间时保留真实ID和文本、时间为null；自动定时采集的严格时间校验保持原样。报告以“时间未知”统计，不编造时间。

## 验证与发布
42项初始隔离测试、登录服务36项回归通过；读取规则修复后52项相关测试通过。Chrome隔离页面验证仅返回目标帖、工具保留未知时间、定时采集仍拒绝缺失时间。现役浏览器会话恢复检查authorized=true。现役页面真实静态资源+隔离API点击通过。

API/Worker/front分别采用release-20261020-facebook-resume-api-r2、release-20261020-facebook-resume-worker-r3、release-20261020-facebook-resume-front-r1；登录服务最终login-session-20261020-facebook-resume-r5。Worker 451文件及登录包630文件清单验证通过。基于切换前现役最小修改，保存XML快照可回退。未修改账号密码、未推Git/BaaS、工具任务不写普通告警或发送通知。

## 边界
本次恢复的是仍在运行的本机登录助手所持浏览器。若助手/浏览器彻底关闭、Facebook Cookie被清除或被平台撤销，不能保证无人工验证恢复；不把Cookie存在单独当作有效授权。

真实用户重试、任务ID与导出结果保存在.tests/2026-10/2026-10-20/single-post/facebook-user-retry.json，最终状态completed，130条、匹配130条、37条回复，真实Excel及Chrome下载结果均已校验。

## 真实单帖与导出修正
真实Last Light目标帖工具任务2608baa0-339e-4fae-a614-e7328ff57f6a完成：130条、ID去重130条，包含37条回复，complete=true（仅当前账号可见范围）。验证同一目标帖的canonical pfbid别名后提取评论，排序后等待可见DOM，分页已见记录允许正常结束。
指定内容请求增加评论ID和发布人平台ID元数据，明确全量导出ID不是正文关键词筛选。缺少发布人平台ID时保留评论、留空该字段，不推测。真实模型前3条验证3条均匹配；严格启用TLS证书验证并使用系统CA完成130条真实重算，130条全部匹配。任务结果已保存，Chrome使用真实结果渲染和下载验证通过、页面无脚本错误。Excel逐条分析与符合要求内容均130行，评论ID与原始结果逐项一致，全部使用字符串单元格、无公式；37条回复按depth>1核验。
切换后API4320、登录4311、前端3001健康检查均200；现有Facebook授权恢复检查authorized=true。Chrome隔离DOM验证目标隔离、同帖别名、回复父级、未知时间以及分页终止通过。真实结果页面渲染测试使用真实抓取数据与现役静态资源、隔离API；不等同于全新电脑SSO全链路验收。

### 最终修改文件
- server/src/connectors/facebookBrowserConnector.js：恢复原绑定浏览器会话，准确显示失败原因。
- login-session-service/src/adapters/facebookBrowser.js：会话恢复、目标定位、评论和回复分页提取。
- worker/src/singlePostRunner.js：回复读取、展开参数、全量ID导出语义及ID元数据。
- server/test/facebookSessionResume.test.js：7项会话恢复回归。
- ../admin/PublicOpinion/js/single-post-analysis.js及资源版本：中文授权错误提示。

发布范围仅本机现役运行包，无Git或静态托管。回滚依据保存在.tests同目录facebook-resume-worker-r3.json及facebook-resume-login-r5.json。
