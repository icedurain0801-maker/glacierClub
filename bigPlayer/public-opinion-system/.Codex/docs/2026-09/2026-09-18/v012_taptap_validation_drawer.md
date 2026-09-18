# TapTap 验证工作区恢复

日期：2026-09-18

## 变更

- 采集源详情抽屉的单列判定明确限定为 BigPlayer H5 的 Token 授权方式。
- TapTap 在详情抽屉中保留双列结构，右列展示只读的“TapTap 采集验证工作区”、监控目标状态和最近检测时间。
- 验证工作区不新增授权检测、同步或凭据提交动作。

## 验证

- `node --check ../admin/PublicOpinion/assets/sources.js`
- `node --test server/test/publicOpinionSourcesMultisite.contract.test.js`

## 待测试回归

- 外网真实浏览器确认 TapTap 为双列且右侧验证工作区可见。
- BigPlayer Token 仍为单列；BigPlayer 账号密码和其他平台仍为双列。
