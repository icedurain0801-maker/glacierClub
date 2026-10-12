# 舆情系统接入 BaaS SSO 与角色权限

六个后台页面接入冰川登录，服务端以固定应用身份校验登录与角色，避免只隐藏按钮而仍可直接调用接口。用户本人配置为 admin；reviewer 可审核处理，analyst/viewer 只读，无角色拒绝访问。原独立存储、采集和分析 Worker 保留。

仅本机使用的新入口 `https://club-opinion.q1.com/admin/PublicOpinion/index.html` 已配置本机解析与 HTTPS，并在 BaaS 登记。包含项目版本 0.1.1、审核操作者接线、受限来源概要、机器导入代理边界、测试和部署说明。

验证：9 项服务端测试、7 个隔离浏览器场景、真实钉钉 SSO 和六页候选浏览器联调通过。正式部署验收结果见同目录 changelog 后续记录。无依赖升级或数据库迁移。
