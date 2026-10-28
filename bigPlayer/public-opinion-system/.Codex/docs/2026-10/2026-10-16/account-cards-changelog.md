# 抓取账号管理模块卡片

Status: 已发布并完成浏览器验收
日期：2026-10-16

用户要求增强管理抽屉的模块边界和副标题层级。抽屉内容区改为浅灰背景，各detail-block采用白色卡片、1px边框、10px圆角、20px内边距和16px模块间距。标题由12px灰色调整为15px加粗深色，配蓝色标记及标题分隔线；表单标签13px、辅助说明12px、输入框36px。窄屏缩减内边距，保留底部固定保存区。

将H5“授权方式”从站点模块中拆为同级独立卡片，并将检测授权按钮与提示移入授权卡片。现有ID、事件绑定、保存和授权门禁不变。H5详情六个同级模块为基础配置、站点、授权方式、同步能力、同步控制、钉钉推送。其他平台复用局部卡片样式。

文件：`../admin/PublicOpinion/assets/sources.js`、`../admin/PublicOpinion/sources.html`。发布包 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261016-account-cards-r1`，在现役包上增量更新两文件相关内容，保留其他差异。47文件manifest、语法与空白校验通过，实际3001响应200并包含新版本。

浏览器在X-Clash详情验证六卡片、授权按钮归属、Token/账密切换及原推送配置回显。390px窄屏实测卡片宽336px、scrollWidth334px，无卡片内部横向溢出；测试后恢复默认视口与Token模式。未提交保存、授权或同步。证据：`.tests/2026-10/2026-10-16/account-cards-desktop.png`、`account-cards-browser.json`。

验收初次列表请求返回internal server error，点击刷新后恢复。该后端瞬时错误不属于此次样式修改，未据此修改API。验收覆盖本机现役域名及X-Clash H5，其他平台未进行真实业务操作；未另行发布BaaS静态托管包。
