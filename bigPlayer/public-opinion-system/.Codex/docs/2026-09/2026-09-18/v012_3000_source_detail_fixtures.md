# 3000 只读验收适配器采集源详情 Fixture 补齐

Status: ready_for_readonly_qa.

## 变更范围

仅修改受管本地 Mock fixture：

- `bigPlayer/.temp/public-opinion-acceptance-fixtures.js`

新增三个无真实凭据的采集源详情样本，并增加 `GET /api/public-opinion/sources/:id` 的 fixture 查找：

- `fixture-bigplayer-token`：BigPlayer H5 Token 模式，用于验证单列抽屉。
- `fixture-bigplayer-password`：BigPlayer H5 账号密码模式，用于验证双列验证区。
- `fixture-taptap`：其他平台样本，用于验证双列验证区。

请求未知 ID 仍为 `404 NOT_FOUND`。适配器服务端没有修改；非 GET 请求仍一律返回 `405 READ_ONLY`，没有写入、采集、授权或同步行为。

## 定向验证

- `node --check bigPlayer/.temp/public-opinion-acceptance-fixtures.js` 通过。
- 对三个 fixture ID 的 `dataFor('/sources/:id')` 均返回对象。
- `dataFor('/sources/unknown')` 返回 `null`。

本次不构成 `siteUrls` 真实保存验收；固定 Mock 的 POST 405 语义保持不变。
