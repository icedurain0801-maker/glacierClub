# v154 Changelog：口碑趋势补充中性系列

## 状态

- 版本：`v154`
- 状态：`QA_PASS_READY_FOR_RELEASE`
- 发布：未执行

## 用户可见变化

- 口碑趋势图例由“正向、负面”扩展为“正向、中性、负面”。
- 摘要独立展示三类情感比例，中性不再并入正向口径。
- 每日趋势增加灰色中性柱，悬浮信息同时展示三类数量和当日总数。

## 口径与边界

- 比例分母只包含 `positive + neutral + negative`。
- `unclassified` 不计入中性，也不计入三类比例分母。
- 某类数量为零时保留系列位置但不绘制伪柱。
- 地区、社区、平台和时间范围继续沿用现有筛选条件。

## 文件范围

- `bigPlayer/admin/PublicOpinion/index.html`
- `bigPlayer/admin/PublicOpinion/assets/app.js`

不新增接口、数据库字段或迁移，不改变采集、分析、告警、同步调度或 Worker 行为。

## 当前落盘记录

- `bigPlayer/admin/PublicOpinion/index.html`：将 `assets/app.js` 缓存查询版本从 `v153` 提升为 `v154`，使 3000 静态入口可加载正式候选脚本。
- `bigPlayer/admin/PublicOpinion/assets/app.js`：中性系列实现已在正式路径，与 v154 候选字节级一致，本次未重复覆盖。
- 3000 QA 静态快照：将 `.temp/candidates/v303-frontend3000-proxy-4320/release/public/admin/PublicOpinion/index.html` 同步为 v154 入口，并同步该 QA release manifest；未重启或修改 3001、4320、Worker、数据库。

## 验证

- 候选 manifest：`8/8 PASS`。
- 候选合同与范围测试：`4/4 PASS`。
- 定向测试：`3/3 PASS`。
- JavaScript 语法：`PASS`。
- 真实 API：`HTTP 200`，固定样本正向 94、中性 58、负面 24，合计 176，`metrics.total=176`，`unclassified=0`。
- 独立测试报告：`.tests/2026-09/2026-09-21/v311_v154_reputation_trend_neutral_final_pass_qa.md`，结论 `PASS`。
- 3000 HTTP 与桌面/移动 `document.scripts` 均实际加载 `assets/app.js?v=154`。
- 真实 API：`HTTP 200`，`total=176`，正向 94、中性 58、负面 24，`attention=61`，`activeAlertCount=0`，`unclassified=0`。
- 桌面 `1280x720`：三类图例、数量和比例正确，无横向溢出。
- 移动 `375x667`：`scrollWidth=375`，横向溢出元素 0，绝对定位元素重叠为 `false`。
- v154 候选 manifest：`8/8 PASS`；3000 QA release manifest：`31/31 PASS`。

## 发布材料

- `.Codex/docs/2026-09/2026-09-21/v154_PR_DESCRIPTION.md`
- `.Codex/docs/2026-09/2026-09-21/v154_sitemessage.md`

## 受控发布准备

- hermetic 候选：`.temp/candidates/v154-frontend3001-controlled-release/`。
- release manifest SHA-256：`7511C26129FD02879DB04E9CD82AE8315874845C964564B1550BC0F466ED6056`，payload `31/31 PASS`。
- candidate manifest SHA-256：`BE91A8E7B78B9B465F73F45B33FBBADD84C455E05E8B68BB2A80DA214035EDE1`。
- 官方 Windows PowerShell 5.1 Preflight：`PASS: frontend3001 isolated preflight used the apply preparation path without SCM or production ProgramData access`。
- 回滚包：`.temp/candidates/v154-frontend3001-controlled-release/rollback/`，离线合同 `5/5 PASS`，manifest `6/6 PASS`。
- 回滚包 SHA-256：`3858FC91B18EF2B6C8F3A6E571099340C2417597D82083A3D71A7BCAC1C7D4B9`；回滚 manifest SHA-256：`055EAEE94D582A9B6ACD254419F57FCD0423ED03DA634DF9EF7711B4DF366DB8`。
- WinSW 候选来源：`C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe`，SHA-256 `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`，Preflight 只读复用验证通过。
- 准备前后 PID `34656` 均继续监听 `[::]:3001`；未安装 `PublicOpinionFrontend3001`，未创建 `C:\ProgramData\PublicOpinion\frontend3001`，未执行 Apply、发布或 push。
- 正式发布仍等待项目经理发起高影响短窗切换确认。

## 回滚

将 `bigPlayer/admin/PublicOpinion/index.html` 中 `assets/app.js?v=154` 恢复为 `assets/app.js?v=153`。本次无数据库回滚。
