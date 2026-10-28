# 社区概览短链接

Status: released
Date: 2026-10-14

- 正式概览支持 https://club-opinion.q1.com/?boardId=XXX；通过员工可访问社区目录的 externalId/external_id 解析内部 communityId，不硬编码社区映射。
- 自动识别境内/境外；不存在、不可访问或重复映射的编号禁止回退到其他社区和发起业务读取。
- 原概览长链接自动转换；今日省略 period 和重复日期，其他预设时间及非默认平台保留。显式自定义起止时间（没有预设 period）保留。
- API 查询与权限仍使用完整 regionCode/communityId/platform。根地址直接返回概览，通过 base 保持静态资源和相对导航正确。BaaS 应用子路径保持原路由。

## 文件
- ../admin/PublicOpinion/assets/scope.js：短链接编码、跨区域解析和历史恢复。
- ../admin/PublicOpinion/assets/app.js：默认今日、预设时间切换与去除自动日期回写。
- ../admin/PublicOpinion/index.html：资源基地址、缓存版本。
- scripts/windows-services/frontend3001-server.js：根地址内部展示概览。

## 验证
9 项自动测试通过；JavaScript 语法检查和 git diff --check 通过；现役前端包 46 文件 manifest 校验通过。
实际登录浏览器验证 boardId=2、100017，近7天切换及刷新、旧长链接转换和抓取内容管理侧栏导航。
仅重启前端3001，保留此前运行包供回滚；不变更数据库、API、采集或分析服务，不执行 git push。