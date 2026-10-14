# TypeSafe HTTP 400：模型名称兼容修复

日期：2026-10-13。状态：本地修复、隔离测试及可见浏览器验证通过；带鉴权真实调用待用户重跑。未提交、未推送、未部署现役Worker。

## 发现

用户截图显示 `REQUEST_REJECTED: HTTP 400`。公开现役规范 `https://chat-test.q1.com/openapi.json` 的 SystemOneRequest.model 仅允许 `jev-latest`、`jev-1.13.0`，默认 `jev-latest`。此前按用户规格发送的 `decision-model-preview` 不在合法枚举中，是确定的协议不兼容项。未获取用户该次错误响应正文，因此不声称已排除其他400原因。

平台仍支持 choice / score / noul；输入 state 可为文本，questions 为对象；返回 answers 中 choice、confidence、noul 与现有解析逻辑一致。

## 修改

- `sentiment_evaluator.py` 默认模型改为 `jev-latest`，三个问题、置信度和业务降级顺序不变。
- HTTP400/401/403增加安全的参数/鉴权/权限排查提示，不打印平台原始响应、密钥、请求文本。
- 对应协议断言及浏览器Mock入口改用并检查实际支持的模型名。

## 验证与限制

- Python隔离测试11项通过。
- 可见Edge读取真实公开OpenAPI，确认model枚举；本机浏览器入口点击执行四用例，模拟验证4/4通过。
- 证据 `.tests/2026-10/2026-10-13/typesafe-model-fix-browser.json` 和同名png。
- Python语法与文件空白校验通过。
- 两次不带密钥的最小请求均返回401，不消耗成功模型调用额度。由此不能推断带鉴权请求成功。
- 截图仅裁剪错误行后用vision识别HTTP400；未从截图读取或使用密钥。
- 用户需要在已设置BCGPT_API_KEY的同一PowerShell窗口重跑 `python sentiment_evaluator.py`；如仍被拒绝，以新错误码继续诊断。
