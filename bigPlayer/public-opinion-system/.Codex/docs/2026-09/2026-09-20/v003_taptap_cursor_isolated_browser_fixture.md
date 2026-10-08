# TapTap 游标续跑隔离浏览器验收入口

日期：2026-09-20

状态：开发自测完成，已交测试负责人

## 目的与边界

针对 QA 缺少可操作浏览器入口的问题，新增纯静态、完全隔离的演示 fixture。它只在浏览器内使用固定 mock 计算两轮分页结果：不启动或调用真实 Worker，不读取凭据，不访问 Provider、3001 或 4320，也不写数据库。

## 产物

- `.tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser_fixture.html`
- `.tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser.test.js`

## 验收操作

1. 直接在浏览器打开 fixture，或在仓库根目录运行静态文件服务器后访问该文件；静态服务器不连接业务服务或 Worker。
2. 点击“执行第 1 轮（20 页预算）”，确认 checkpoint 显示 `{"version":1,"accountIdx":0,"from":200}`。
3. 点击“执行第 2 轮（从 checkpoint 续跑）”，确认“第 2 轮首个请求 cursor”为同一 `from=200`，累计唯一内容为 `400`。
4. 点击“重放第 2 轮首页（去重验证）”，确认显示“新增 0，去重 10”。

## 自测

```powershell
node --test .tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser.test.js
# 1 passed, 0 failed

node --check .tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser.test.js
git diff --check -- .tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser_fixture.html .tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser.test.js
# 均通过
```

## 限制

此入口只证明已拍板的 cursor 续跑和去重合同在浏览器中可观察，不替代真实服务更新、真实补跑或生产数据恢复验收；这些行为未执行。
