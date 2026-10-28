# Facebook 钉钉继承及专属群

Status: deployed, 2026-10-20

Facebook网页采集配置抽屉接入现有钉钉内容推送组件。默认复用同社区BigPlayer的社区推送设置（群、开关、内容类型）；可切换“此Facebook单独指定群”，选择已有群或添加新群，独立启停并选择紧急告警/关注级/优质内容。新群Webhook和加签密钥仍由现有BaaS机器人接口保存，不回显。未保存的新增采集源不发推送配置请求，保存创建后才出现设置。

服务配置新增sourceRoutes，仅Facebook可保存mode=inherit/custom。custom写sourceRoutes[sourceId]，不更改communityRoutes或其他来源；inherit删除覆盖并复用社区路由。关闭独立路线仍保留覆盖，防止意外恢复继承推送。发送器社区/旧账号路由跳过有覆盖的sourceId，独立路线按gameId+sourceId读取任务，避免双群重复推送。内容时间窗、昨日补推标注、发送回执去重和分析完成门槛沿用现状。

修改：server/src/services/baasDingTalk.js、worker/src/collectionDingTalk.js，前端facebook-browser.js、baas-dingtalk.js、sources.html；新增服务路由测试并增加发送器覆盖测试。34项服务与发送器隔离测试通过；Chromium模拟接口验证FB抽屉挂载、继承初始化、专属群保存和切回继承通过，未调用robot/send，无真实群测试消息。语法/空白检查通过。

现役API release-20261020-facebook-external-api-r1，前端release-20261020-domestic-platforms-r1；定时器PublicOpinion BaaS DingTalk Alerts实际入口release-20261020-member-index-dingtalk-r1/worker/src/baasDingTalkRunner.js，已按片段补齐配置及发送路线。API重载后Running。没有修改实际群路由、凭据或触发定时器；已开启的原路线继续按现有配置执行。用户保存FB专属群后下次定时检查使用新路线。

限制：复用对象为现有同社区社区路由；若尚未在BigPlayer开启推送，FB显示未开启提示，可改为专属群。继承模式不支持单独选择FB内容类型，需要独立路线。完整登录后的真实配置保存和真实群发送未执行，凭隔离测试及线上资源返回验收。
