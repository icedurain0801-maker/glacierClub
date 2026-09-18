# BigPlayer Token 抽屉单列调整

## 变更范围

- BigPlayer H5 编辑抽屉处于 Token 授权方式时，隐藏右侧 `validation-column` 及其 Token 无需登录验证的占位内容。
- Token 抽屉改为单列网格并收窄至 680px；小屏幕仍沿用全宽抽屉。
- 切换至账号密码方式时，恢复原验证工作区和双列布局；Discord、TapTap 等其他平台不受影响。

## 验证

- `node --check ../admin/PublicOpinion/assets/sources.js` 通过。
- `node --test server/test/publicOpinionSourcesMultisite.contract.test.js`：3/3 通过，覆盖 Token 条件、单列网格与验证列条件渲染。
- 本地浏览器已加载更新后的 `sources.js` 与 `.detail-grid--single` 规则，确认 Token 单列抽屉宽度规则为 680px。
- 本地静态页面未连接业务数据，无法打开真实源详情；待 QA 在现有业务环境回归 Token/账号密码切换及其他平台抽屉布局。
- 额外运行 `../admin/PublicOpinion/assets/source-status.test.js` 时，既有“stale sources response cannot replace the latest scope result”失败，错误为 `state.scope.available is not a function`；该来源列表竞态用例与本次抽屉条件渲染无关，未作范围外修复。

## 未执行项

- 未调用翻译、采集或外部平台，未部署、推送或发版。
