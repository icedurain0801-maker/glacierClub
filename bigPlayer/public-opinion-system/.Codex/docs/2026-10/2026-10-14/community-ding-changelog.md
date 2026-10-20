# 钉钉机器人按社区配置

日期：2026-10-14

## 需求和实现

机器人别名、群名/备注、Webhook、加签密钥和绑定操作从 API配置移至抓取账号管理 → 管理 → 紧急告警推送。API配置继续保留全局后台授权/续授权入口。

管理弹窗可选择已绑定机器人，或展开绑定新机器人/更新已有机器人。绑定成功自动选中该机器人，保存推送配置后生效。使用已有机器人别名更新时，文案明确告知所有共用该机器人的社区会使用更新后的群。

路由从按账号改为按 game_id + community_id 保存；同一社区的不同来源/账号统一使用一个机器人，不同社区可共用或独立选择机器人。保存社区配置时移除该社区旧账号路由，避免重复或冲突。旧账号配置未被保存替换之前继续兼容。启用时间保持稳定，更换机器人或重新启用建立新的起点，不补发历史。

后台按社区范围查询紧急告警，保留来源启用、分析有效性、独立紧急复核、发送去重和审计约束。Webhook/secret仍仅交BaaS保存，不保存在本地路由配置、不回显。

## 修改文件

- `server/src/services/baasDingTalk.js`：社区配置读取与保存。
- `worker/src/baasDingTalkRunner.js`：社区路由查询及旧账号路由兼容。
- `../admin/PublicOpinion/assets/baas-dingtalk.js`：移动绑定表单，社区选群与保存。
- `../admin/PublicOpinion/api-config.html`、`sources.html`：更新脚本缓存版本。
- `.tests/2026-10/2026-10-14/baas-dingtalk.test.cjs`、`community-ding-browser.cjs`：隔离业务测试和浏览器验收。

## 验证

6项隔离测试全部通过，覆盖授权鉴权、凭据保护、社区配置隔离/共用/切换、启用时间稳定、社区范围SQL、跨账号告警去重和失败不盲目重发。JS语法和定向空白检查通过，前端运行包46文件验证通过。

真实可见Edge浏览器：API配置不再显示绑定字段；管理弹窗显示全部绑定字段，无账号选择器；真实社区配置读取HTTP200；非法Webhook绑定HTTP400，敏感字段清空；无页面JS错误。保存选群A、群B、关闭推送使用隔离响应验证前端请求契约，不修改生产推送配置。后端保存隔离与路由查询由隔离服务测试覆盖。

未绑定/启用真实群，未发送消息；当前后台任务返回0，configuredAccounts=0、configuredCommunities=0。真实群收件尚未验证。

证据：`community-ding-browser.json`、`community-ding-api-config.png`、`community-ding-manage.png`。

## 现役更新

基于切换时当前运行包定向叠加，保留其他风险分析改动：

- API：`C:/ProgramData/PublicOpinion/releases/release-20261014-community-ding-api-r1`
- 前端：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-community-ding-front-r1`
- 独立推送任务：`C:/ProgramData/PublicOpinion/releases/release-20261014-community-ding-runner-r1`

API、前端服务Running，推送计划任务最近运行结果0。未更改采集/分析Worker，未提交或推送Git。
