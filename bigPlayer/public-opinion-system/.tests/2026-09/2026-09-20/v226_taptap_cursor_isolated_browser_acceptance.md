# v226 TapTap cursor 隔离浏览器验收

- 测试时间：2026-09-20（北京时间）
- 环境：`http://127.0.0.1:3000` 免登录 acceptance adapter
- Fixture：`.tests/2026-09/2026-09-20/v225_taptap_cursor_isolated_browser_fixture.html`
- 边界：固定 mock，仅浏览器内运行；不加载 Worker、凭据、Provider 或真实 API，不写数据库，不访问 `3001/4320`，不触发真实同步

## 执行结果

| 步骤 | 页面证据 | 结果 |
|---|---|---|
| 第 1 轮 | `PASS：处理 20 页 / 新增 200 条 / 预算耗尽后保存 idle checkpoint`；checkpoint=`{"version":1,"accountIdx":0,"from":200}` | PASS |
| 第 2 轮 | `第 2 轮首个请求 cursor`=`{"version":1,"accountIdx":0,"from":200}`；累计唯一内容 `400` | PASS |
| 首页重放 | `PASS：重放 from=200 的 10 条内容，新增 0，去重 10` | PASS |

## 请求轨迹证据

- 第 1 轮第 1 页 cursor 为 `null`，随后按 `from=10`、`20`、...、`190` 递进，共 20 页。
- 第 2 轮第 1 页 cursor 为 `{"version":1,"accountIdx":0,"from":200}`，随后按 `from=210`、`220`、...、`390` 递进，共 20 页。
- 页面最终 checkpoint 为 `{"version":1,"accountIdx":0,"from":400}`。

## 控制台与范围

- Fixture 页面无页面错误；页面明确声明不访问 Provider/API、不写库、不触发同步。
- 本次仅证明隔离 fixture 合同，不能替代真实服务、真实 run、真实内容页或线上今日恢复验收。
- 其他平台、TapTap 回填和评论游标：本 fixture 未覆盖；由开发定向自动化回归 2/2 PASS 提供隔离补充证据，仍不等同线上浏览器验收。

## 结论

TapTap cursor 修复在受控隔离浏览器 fixture 中 **PASS**。整体发布/线上修复结论仍为 **未验收**：未更新真实服务、未真实补跑、未发版，不能宣称今日内容已恢复。
