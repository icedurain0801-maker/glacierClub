# 支付配置管理侧栏加载修复

日期：2026-10-20

## 反馈与检查

用户截图中，左侧“配置中心”与“iOS灵动岛推送日志”之间未显示“支付配置管理”。检查时磁盘 `admin/sidebar.js` 及本机 HTTP 返回脚本均已包含支付子入口；截图呈现为旧版导航，旧脚本缓存是最可能的原因，但未直接读取用户当前浏览器缓存，不能把缓存命中写为已证实事实。

## 修改

将所有九个使用 SDK 共享侧栏的页面引用统一更新为 `../sidebar.js?v=20261020-payment-nav`，避免继续复用无版本 URL 的旧脚本。支付配置入口仍位于配置中心下方，保持原有缩进、激活态和目标路径。

涉及页面：

- `admin/schemeManagement/sdkSchemeManagement.html`
- `admin/schemeManagement/schemeList.html`
- `admin/schemeManagement/specialScheme.html`
- `admin/config/paymentConfigManagement.html`
- `admin/config/configList.html`
- `admin/config/configCreate.html`
- `admin/config/channelGroupManagement.html`
- `admin/config/channelGroupCreate.html`
- `admin/logs/iosLiveActivityPushLog.html`

另外更新 `.tests/2026-10/2026-10-20/payment-config-management.test.cjs`，检查版本化脚本引用及唯一支付子入口。

回归中发现 375px 窄屏侧栏展开时会遮挡收起按钮；在 `admin/config/paymentConfigManagement.css` 中将移动端侧栏放在顶栏下方，保留收起按钮可点击。测试等待侧栏完全展开后再检查收起操作，避免因动画时序而漏测遮挡。

不修改表单业务逻辑，不重启服务，不变更大玩家和舆情系统，不清空用户浏览器缓存或存储。

## 验证结果

- 九个共享侧栏页面均使用同一版本标记。
- 在隔离浏览器中模拟旧版无版本 `sidebar.js` 返回：更新后的页面没有请求该旧 URL，仍显示唯一支付入口；从工作台点击后正确进入支付页，并高亮支付入口。
- 全量支付原型浏览器测试通过，包括 1920/1440/375px 视口及侧栏完全展开后的收起操作。
- JavaScript 语法及针对修改页面的 `git diff --check` 通过。8092 服务仍为原 PID 40180。
- 导航截图：仓库根 `.temp/sdk-payment-config-2026-10-20/navigation-fixed.png`。
- 用户现有标签页需刷新或通过 `http://127.0.0.1:8092/config/paymentConfigManagement.html?v=20261020-payment-nav` 重新打开，以加载更新后的 HTML。
