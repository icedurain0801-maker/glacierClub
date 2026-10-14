# Last Night 当前三站 languageId 碰撞回归

Status: isolated-gate-pass-production-no-go
Date: 2026-10-08

项目经理转交产品经理同快照只读结论：当前批准的 Last Night 三个启用 site URL 仅 `languageId=2/9/16` 不同。现有 `q1Context` 不读取该字段，`requestQ1` 的绝对 `/api/...` 请求不继承 URL 查询串；没有上游合同或脱敏响应 ID 证明三站独立。

`worker/test/lastNightIsolatedPipeline.test.js` 新增仅 `languageId` 不同的代表性三站 URL 回归，要求真实 Connector 在 HTTP 与 Store 写入前报 `LAST_NIGHT_UPSTREAM_SITE_COLLISION`。`worker/test/lastNightIsolatedExecutor.test.js` 用同一形状确认 `freezeSites` 在拒绝前未调用。`worker/src/lastNightIsolatedPipeline.js` 的失败关闭门禁保持不变；不修改 `server/src/connectors/bigPlayerH5Connector.js`，不猜测注入 `languageId`。

开发侧定向 11/11 PASS；Worker 全量首轮 310/311，失败用例输出未保留，不能判定原因；随后两次复跑均 311/311 PASS。43319 隔离库 E2E 14 contents / 14 tasks / 28 jobs / 28 results、崩溃恢复、回滚、实例停止与端口释放均 PASS，`productionTouched=false`。首轮异常与本次差异一并交独立 QA 判定，不把开发侧复跑等同最终放行。

独立 QA 对以下精确 SHA256 给出 `PASS_ISOLATED_LANGUAGEID_COLLISION_GATE`：Pipeline 测试 `7697E81905FB815ED7F32FF50F013946D13D4186A789B95774DD0066B4F05708`；Executor 测试 `7394D571F2047424C07C78643989A5523B5B20231E6438C0B79F6798BAEEA73C`；`v027_lastnight_three_site_upstream_contract_gap.md` `75C332C086E79109339D5BA7646221CD9365330C8981A6140227BEF18CC249E2`。QA 定向 11/11、Worker 全量连续三轮 311/311、43319 E2E 14/14/28/28 均通过；开发首轮 310/311 因无原始失败输出仍无法解释，不计入全绿证据。没有可复现失败或具体新风险时不因该缺口无限复跑。生产仍 `NO_GO`，实质阻断为三站上游合同、限权 reader 与真实 API/AI 证据。

待上游/接口负责人提供真实区分字段、合同版本、脱敏 board/内容 ID 集合及重复关系后，再评估 Connector 变更并冻结候选交独立 QA。生产执行、真实 API/AI 与生产数据库访问继续 `NO_GO`。
