# 全局 API 配置管理

日期：2026-10-13

## 变更

- 采集导航末尾新增“API配置”，独立页面 api-config.html；从抓取账号移除 TypeSafe 入口及脚本引用。
- 页面不展示社区筛选；新导航不继承社区参数。全局配置接口 GET/PUT /api/public-opinion/api-config/typesafe 复用已有加密存储及授权检测，响应标记 scope=global。旧配置接口保持兼容。
- TypeSafe 密钥一次保存，后台后续测试复用；不回显、不写浏览器存储，授权失败保留原配置；仅管理员可读写、运行测试，匿名入口和非管理员不能访问配置页面。
- 配置与测试分区；保留超能国服25帖+25评论测试、后台执行及返回页面恢复结果。按既有范围，暂不替换自动分析。
- Windows 原子写文件遇短暂锁定时，最多4次有限退避重试，不删除目标或降级为非原子写入。
- 保留空的需求说明面板；修复关闭面板及手机视口溢出。

## 主要文件

- ../admin/PublicOpinion/api-config.html
- ../admin/PublicOpinion/assets/typesafe-test.js、typesafe-test.css、baas-auth.js
- ../admin/PublicOpinion/sources.html（移除入口），各HTML（共享导航/鉴权缓存版本）
- ../shared/sidebar-data.js、sidebar.js
- server/src/app.js、server/src/services/typesafeTestService.js

## 验证

- TypeSafe隔离服务测试：7/7通过；覆盖加密持久化、失败保留、管理员权限、50条后台执行、重复请求及重启中断。
- 可见Edge隔离自测：从带社区参数账号页进入全局页无query；检测失败、保存成功、启动50条、刷新恢复、跨社区读取同一配置、非管理员隐藏、空帮助面板开关、390px和1440px视口通过。
- 可见Edge真实站点自测：club-opinion.q1.com 新导航及页面可达，全局API 200、scope=global、无密钥回显、autoAnalysisEnabled=false，浏览器无脚本错误。
- 本机API/前端运行包校验：411/45文件通过；两个服务Running。
- 真实平台50条未调用：本机尚未保存密钥。上述50条执行验证使用隔离模拟平台，不覆盖现有分析、无通知。

## 本机更新

- API：release-20261013-global-api-config-r1
- 前端：release-20261013-global-api-config-r1
- 从现役包复制，仅应用本次变更；未重启Worker、未修改业务数据库、未提交或推送Git。
