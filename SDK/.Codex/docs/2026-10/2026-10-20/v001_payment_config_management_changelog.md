# 支付配置管理原型变更

日期：2026-10-20

## 完成内容

- 在用户指定的 SDK 工作台共享侧栏中，将“支付配置管理”作为“配置中心”下的缩进子入口。
- 按七张参考截图实现新增支付配置页面：方案类型下拉，以及支付成功回调地址、谷歌、苹果、华为、华为快游戏、鸿蒙六类表单。
- 实现搜索式下拉、键盘操作、范围/BundleId 标签、类型内存草稿、启用状态及字段校验。
- 沿用 SDK 工作台视觉；桌面输入框统一 400px，长标签保持单行；375px 窄屏采用纵向排布。

## 文件

| 文件 | 变更 |
|---|---|
| `admin/config/paymentConfigManagement.html` | 新增正式页面和表单外壳 |
| `admin/config/paymentConfigManagement.css` | 新增页面与响应式样式 |
| `admin/config/paymentConfigManagement.js` | 新增六类字段映射与交互 |
| `admin/sidebar.js` | 最小追加支付子入口与子项渲染，保留原有 iOS 日志入口及审核提示逻辑 |
| `docs/design/feature-payment-config-management.md` | 字段映射、交互与安全边界 |
| `.tests/2026-10/2026-10-20/payment-config-management.test.cjs` | 本地浏览器测试脚本；遵循现有 `.tests/` 忽略规则 |

## 验证结果

- 浏览器测试通过：工作台入口、六类字段、400px 等宽、单行标签、下拉搜索/键盘、必填与 URL 校验、范围/BundleId 标签、草稿隔离、开关、取消。
- 1920×919、1440×900、375×667 渲染检查通过；375px 无页面或表单横向溢出。
- 页面无 JavaScript 运行错误，HTML/CSS/JS 请求无 4xx/5xx 错误。
- `node --check admin/config/paymentConfigManagement.js`、`node --check admin/sidebar.js` 与针对侧栏的 `git diff --check` 通过。
- 新页面本机 HTTP 请求返回 200；8092 服务仍为原 PID 40180，未启动/停止/重启其他服务。

浏览器测试命令（在 SDK 目录运行；使用已存在的依赖）：

```powershell
$env:SDK_PAYMENT_PLAYWRIGHT_MODULE='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:SDK_PAYMENT_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:SDK_PAYMENT_SCREENSHOT_DIR='E:/CodexData/projects/.temp/sdk-payment-config-2026-10-20'
node .tests/2026-10/2026-10-20/payment-config-management.test.cjs
```

## 预览与限制

- 工作台：`http://127.0.0.1:8092/schemeManagement/sdkSchemeManagement.html`
- 新页：`http://127.0.0.1:8092/config/paymentConfigManagement.html`
- 本次仅静态原型，不接真实支付后端；提交只做前端校验，不保存、上传密钥或 Token。
- 未覆盖用户原有修改，未修改大玩家或舆情系统，未执行 Git 提交或推送。
