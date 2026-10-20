# 钉钉推送交互简化

日期：2026-10-14

原交互需要先绑定机器人、再选群开启并另行保存，用户反馈难以理解。

改为统一流程：开启推送 → 使用已有群/添加新群 → 保存推送设置。关闭时隐藏群表单；新群仅填写群名称、Webhook、加签密钥。内部机器人别名自动生成，避免用户误覆盖其他社区共用的机器人。移除单独绑定按钮与刷新按钮。

统一保存串行执行绑定与社区路由保存；只有社区路由保存成功才显示已开启。绑定成功但路由保存失败时，明确提示再次保存，并复用已绑定的机器人，不重复创建。敏感输入在请求前清空，不在报告中记录。关闭保存仅更新社区路由，不绑定机器人。

修改：`../admin/PublicOpinion/assets/baas-dingtalk.js`、`api-config.html`、`sources.html`。后端及推送算法未更改。

验证：语法及定向空白检查通过；前端运行包46文件校验通过。真实可见Edge浏览器确认真实配置读取HTTP200、非法Webhook绑定HTTP400、凭据清空、初始关闭隐藏字段、必填校验正常。成功绑定、部分保存失败后重试、已有群选择、关闭保存使用隔离接口响应验证，无真实生产配置写入或消息发送，无JS错误。

证据：`.tests/2026-10/2026-10-14/ding-simple-browser.cjs`、`ding-simple-browser.json`、`ding-simple-new.png`、`ding-simple-saved.png`。

现役前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-ding-simple-front-r1`，仅前端服务切换；API、采集分析Worker、推送任务未修改。未提交或推送Git。
