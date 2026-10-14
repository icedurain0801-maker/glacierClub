# v193 Q1 provider 分页预算修复：独立回归

- 验收角色：测试负责人
- 范围：BigPlayer H5 Q1 分页预算的代码级回归；未触发真实采集或补跑。

## 结果：PASS

| 检查项 | 结果 |
|---|---|
| 默认预算 | PASS：未配置 `BIGPLAYER_H5_FEED_MAX_PAGES` 时为 `ceil(10000 / pageSize)`；pageSize=50 覆盖 200 页。 |
| 显式预算优先 | PASS：正整数 `BIGPLAYER_H5_FEED_MAX_PAGES` 继续覆盖默认值。 |
| offset 硬上限 | PASS：到达 10000 前后仍 fail-closed，并在凭据/网络前拒绝。 |
| 空页、重复页门禁 | PASS：空页、重复页、停滞分页均维持原 fail-closed 行为。 |
| 目标测试 | PASS：`connectorSlice.test.js` 42/42。 |
| 连接器回归 | PASS：`connectors.test.js` + `connectorSlice.test.js` 55/55。 |

## 结论

最小修复仅将 Q1 feed 的默认页预算从通用 crawler 限制解耦，提升至 provider offset 上限覆盖范围；显式限制与安全边界未回退。可进入后续发布流程，但本次未做真实采集验证。
