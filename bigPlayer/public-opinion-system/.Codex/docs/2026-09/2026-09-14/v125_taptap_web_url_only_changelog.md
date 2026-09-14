# v125 TapTap 配置仅保留网页地址

日期：2026-09-14

## 变更

- TapTap 配置抽屉仅展示网页地址，隐藏采集频率、每日执行时刻和平台账号标识输入。
- 超能世界默认填充 `https://www.taptap.cn/app/239580/topic?os=android`，其他社区默认空白。
- 创建与保存 TapTap 时仅提交网页地址和系统必需的显示名称，不再提交频率、日程或账号标识。
- 后端允许 TapTap 配置请求省略监控账号/版块 ID 与频率；省略频率时保留原值，并持久化网页地址。
- TapTap 网页地址经过通用 HTTP(S) URL 校验。

## 验证

- `node --check admin/PublicOpinion/assets/sources.js`：通过。
- `node --check public-opinion-system/server/src/app.js`：通过。
- `node --test admin/PublicOpinion/assets/source-status.test.js`：15/15 通过。
- `git diff --check`（本单文件）：通过。

## 范围

未修改抓取频率策略、同步/授权/抓取脚本、翻译逻辑及其他平台；未 push、未发版。
