# v129 抓取账号详情抽屉加载优化

日期：2026-09-15

## 根因

- 详情接口在 `sourceWithAccount()` 中串行查询账号、同步状态、凭据和能力，数据库往返会累加。
- 打开部分账号详情后还会自动请求登录状态与验证挑战，使一次点击产生额外请求。
- 前端详情请求没有超时兜底，接口迟滞时加载态会无限等待。
- 加载提示仅做文本居中，没有占据抽屉内容区并垂直居中。

## 变更

- 同一详情抽屉打开期间重复点击直接去重，一次点击仅发起一次 `GET /sources/:id`。
- 移除打开详情时自动追加的登录状态/挑战请求；授权检测仍由原有按钮显式触发。
- 详情请求增加 8 秒超时，中止后显示明确错误和重试入口。
- 服务端将账号/能力、同步状态/凭据两组互不依赖的查询并行执行。
- 加载态按视口高度占满抽屉内容区，并水平、垂直居中。

## 验证

- `node --check admin/PublicOpinion/assets/sources.js`：通过。
- `node --check public-opinion-system/server/src/app.js`：通过。
- `node --test admin/PublicOpinion/assets/source-status.test.js`：17/17 通过。
- `node --test public-opinion-system/server/test/app.routes.test.js`：57/57 通过。
- `git diff --check`（本单文件）：通过。

## 范围

未修改抓取任务、账号数据、采集频率、同步逻辑、其他平台表单或全局布局；未 push、未发版。
