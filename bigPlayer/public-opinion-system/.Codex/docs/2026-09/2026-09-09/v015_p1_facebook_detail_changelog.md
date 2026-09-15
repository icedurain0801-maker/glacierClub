# P1 真机验收缺陷修复

- Status: completed_local_qa
- Date: 2026-09-09
- Scope: 本机精确页面与依赖 API

## 已完成

### 1. Facebook 概览只读筛选

- `server/src/app.js` 新增只读平台筛选白名单，仅额外允许 `facebook`。
- GET `/api/public-opinion/overview` 与 GET `/api/public-opinion/sources` 使用只读平台解析。
- 采集源创建及其他写接口继续使用原 `SOURCE_PLATFORMS` 白名单，不开放 Facebook 采集源创建。
- 未顺带开放 `x`、`lounge` 或其他平台。

### 2. 内容详情补齐分析字段

- `../admin/PublicOpinion/assets/content.js` 在详情抽屉的 AI 分析区展示“风险等级”和“分析状态”。
- 复用列表页既有 `severity`、`analysis-status` badge 与标签映射，缺失风险等级仍按 `normal` 展示。
- `../admin/PublicOpinion/content.html` 将 `content.js` 缓存版本从 `v=25` 更新为 `v=26`。

## 验证结果

- `node --check server/src/app.js`：通过。
- `node --check ../admin/PublicOpinion/assets/content.js`：通过。
- `node --test .tests/2026-09/2026-09-09/v002_p1_facebook_detail_contract.test.js`：3/3 通过。
- `node --test server/test/sourceValidators.test.js`：5/5 通过。
- 本机真实 API 只读验证：Facebook overview 200、Facebook sources 200、未知平台 overview 400。
- 本机只读验收页：Facebook 概览正常展示；详情抽屉显示“风险等级：关注”“分析状态：已完成”。
- `git diff --check`：相关文件通过。
- 验收结束后，本机 3000、4320、8123 临时服务均已停止。

## 独立待复验

- 真实翻译 A-D 样本尚未提供；不伪造样本，不触发重新分析或补偿，不写业务数据。
