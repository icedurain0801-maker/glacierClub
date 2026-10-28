# 优质内容详情补齐翻译和发布人信息

Status: 已发布并浏览器验收

## 根因与修改
上轮只验证了钉钉模板，没有覆盖优质内容管理详情抽屉。抽屉缺少作者与翻译展示，现役 SQL 详情查询还漏选 platform_author_id 和译文字段。

- ../admin/PublicOpinion/assets/alerts.js：境内、境外统一显示发布人昵称、发布人ID和内容平台ID；境外复用中文翻译组件，使用 content_id 而非候选ID。
- ../admin/PublicOpinion/alerts.html：更新脚本缓存版本。
- server/src/db/repository.js：详情查询带出作者ID，并只读取 zh-CN、当前翻译版本及当前 fingerprint 的译文，保留社区范围过滤。

## 验证
- 页面字段和查询新增3项用例通过，云端查询既有14项回归通过；语法检查通过。
- 实际浏览器验收：境外 Last Light 帖子1603483，昵称VKD_VD，发布人ID5493828，显示原文和现存中文翻译。
- 实际浏览器验收：境内超能世界帖子928246，昵称煜铭，发布人ID2807800，显示帖子ID928246。
- 仅只读查看，未采集、重译、审核或发送钉钉消息。

## 发布
前端 release-20261015-quality-detail-metadata-r1，47文件manifest通过；API release-20261015-quality-detail-api-r1，430文件manifest通过。分别基于现役包增量更新，备份XML在当日.tests目录。只重启前端与API，无数据库结构更改。

评论自身ID继续标记为评论ID，不能冒充帖子ID。

## 补充：所有详情都有帖子ID
评论候选同时展示原帖平台ID与评论平台ID。SQL按同源、同游戏、同社区查找根帖，缺失时明确显示原平台未提供，不使用内部UUID。新增评论用例通过，本轮共4项新增回归通过。r2前端/API manifest分别47/430文件通过，已切换。
