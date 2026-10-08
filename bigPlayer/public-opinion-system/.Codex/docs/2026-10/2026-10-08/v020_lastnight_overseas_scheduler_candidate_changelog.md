# Last Night 海外专用调度与站点身份隔离候选

Status: isolated-candidate-pending-independent-qa; production-no-go
Date: 2026-10-08

## 变更

- `worker/src/lastNightOverseasDailyJob.js`：仅绑定 Last Night 海外 source、game、community 和 board。三站点配置与 registry 未对齐时在调度前失败关闭；已对齐时通过现有统一调度的 `sourceAllowlist` 生成单一父 Run 和三个 `scheduled_site` 子 Run，逐个复用 `runSource`。三个子 Run 和父 Run 均成功终态后才调用 source 限定的轻/深 AI 分析。`--dry-run` 不加载服务环境、不连库；`--execute` 仍需显式环境门禁。
- `worker/src/lastNightSiteAlignment.js`：仅提供非 CLI 的事务候选。要求精确批准的规划 SHA，锁定目标 source，拒绝活跃 Run/租约、历史 site 身份漂移；仅把匹配旧 URL 的一个配置 siteId 改为 legacy ID，并新增其余两个 registry 站点。异常回滚，不更新历史 Run/checkpoint。
- `worker/test/lastNightOverseasDailyJob.test.js` 与 `worker/test/lastNightSiteAlignment.test.js`：覆盖范围拒绝、历史身份保护、统一调度接线、三子 Run/父 Run 终态、AI 前失败关闭、事务回滚和 dry-run 零连接。

## 隔离验证

- `node --test` 对上述两项及统一调度接线、候选加载、调度仓储、Q1 分析、分析 Worker 共七个测试文件执行，71/71 PASS，0 FAIL。
- 原始 TAP：仓库上级 `.temp/po-closeout-20261008/lastnight-overseas-isolated-20261008.tap`，SHA256 `3A558F0517F2DE09A1B8FCEC484EDF5EA8EAEA4AA4A222B7C52782F44ABCCE47`。
- 候选 SHA256：入口 `0ADDB8BED5E20E88CA9CFAA22D83178951077F1812096393073A6438ACC34B6F`；站点事务 `C2D04856D102A1DE18291F9FEA5DAC019ABE2592EECC389723F20B32A81BE242`；入口测试 `6BCB7337724FDA392CF858BB72BD3B918CEF60A68876BEEED8B36B2D056B042A`；站点测试 `D94FB4622D129CAE29F816AA2CF346BEE720A0D3911EB1180863BC1A709D5D7D`。

## 门禁与交接

已向测试负责人交独立 QA；本地自测不构成 QA PASS。当前未执行站点对齐事务、生产迁移 `029/030`、生产调度/抓取、入库或 AI。三站点生产身份尚未对齐，生产备份/排空和同版切换门禁未过；真实链路仍为 `NO_GO`。不得用本隔离结果声称真实抓取完成，也不得触碰国内 Worker、现有健康调度、Discord、TapTap、Facebook 或算法。
