# D1 非秘密配置投影与 v019 静态绑定独立 QA

Status: D1_CURRENT_PROJECTION_VERIFIED / D2_D7_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## 范围与原件

- 新入口 `scripts/overseas-d1-d2-d7-readonly.js` SHA256 `4A0097D866F6AEAD7D7929F5AA62F8397B4D4A7F3087805E547DA2235B0113EE`。上一轮 v1 入口和原件保持历史退回，不用旧 SHA 验新代码。
- 开发补采：统一根 `.temp/overseas-d1-d2-d7-dJSJqc/result.json` SHA256 `A687D70E4B8FAD3B289D7AC094EC3223ACDC9405C427A7604A03492421FFB03C`；2026-10-10 05:05:56.106–.165（Asia/Shanghai）。
- QA 独立短读：统一根 `.temp/overseas-d1-d2-d7-5c2nvt/result.json` SHA256 `8B22721480E4ED35C08AAF482EDC540AE2A9F8568DAECACDE3083067BFEB74D2`；2026-10-10 05:06:55.140–.180（Asia/Shanghai）。exit 0，两个原件均 `READONLY_EVIDENCE_COLLECTED`、`status=NO_GO`。
- 目标固定本机回环 3306、server_id 1、MariaDB 10.4.14 和指定库；九条白名单短 SELECT 处于 `START TRANSACTION READ ONLY`，最终 `rolledBack=true`、`connectionEnded=true`。未执行 HTTP、token exchange、AI、SQL 写入、DDL、ACL、服务或国内改动。

## 独立安全预检

- 旧入口负测证实 `scheduleVersion` 变化不改变旧 hash，且被遮蔽的 URL token 仍影响旧 hash；当时未连接数据库并退开发修复。修正入口先经 QA 纯内存探针，再允许开发补采和 QA 独立短读。
- 修正后 `scheduleVersion` 实际进入 `configProjection`，`bindingFields` 从实际键集合生成；QA 对合成输入独立重算 canonical SHA，改版本/站点身份会变 hash。公开 URL 参数顺序变化不影响摘要；secret/未知 query 值既不输出也不影响摘要。无效 URL、userinfo、fragment、重复公开参数返回 `{invalid:true}`，不留原文摘要；原 registry `storedUrlHash` 不进入本投影。
- QA 合成原件 `.temp/v027-qa-projection-fixed-probe.raw.json` SHA256 `88FC357F9462CE38B68A98C6E9739DC8A2E08E6F14BEB3268A057C476187B647`；脚本 SHA256 `75465F1CF724997482CB6EE029F8E8232216C589F26ADC40F571E056CC5959E8`，exit 0。

## 当前事实

QA 从两个脱敏原件公开的 `configProjection` 独立重算 SHA，`bindingFields` 与投影键一致，开发/QA 两次投影逐字段相同：

| 来源 | scheduleVersion | 当前 `nonsecret-config-v2` SHA256 | 静态绑定 |
| --- | ---: | --- | --- |
| SRC-A | 1 | `c991fbfe75340eab491f839dea92234b12f017620f252b6083ba3de4f1d02f7f` | boardId `100017`，同源 3 站身份匹配 registry；URL 公开参数 `env=web`、`gameId=2177`、`gameVersion=2177-US-ZS`、`lang=en-US`、languageId `2/9/16` |
| SRC-B | 1 | `aec49156b13f20638c9f556f394d45e4ea49c37a95a7680591681803fae08731` | boardId 缺失；配置 3 站、registry 1 站，site 身份 0/3 匹配 |

SRC-A registry 仍有两站 `auth_status=unknown`；不得用本静态投影替代 context/board 实际授权检查。QA 原件复核脚本 `.temp/v027-qa-raw-verify.js` SHA256 `DAB04F53B8660E4B1030991EE138C547C2B7EAC9A0533589309D96A9DC2EADD9`，输出 `.temp/v027-qa-raw-verify.raw.json` SHA256 `09E081E470E533F4984FE827553CBCE4CF9DF54832CE84CB4C3C41C7DCF821F8`，exit 0。

## 结论边界

本轮只签当前非秘密投影及 v019 首源请求计划的静态参数绑定，可用于同投影后续变化检测。它不是完整原始配置 hash、生产发布版本/变更历史、secret 合同或真实站点授权；`scheduleVersion=1` 是当前数据库字段，不等于完整发布合同。不得启动 v019 HTTP/token 侦察或采集。D2 两站授权 unknown、第二源 board/registry 错配和 D7 生产 scope cap、金额、失败/重试费用及 provider 合同仍 `NO_GO`，整体维持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。没有修改业务代码、生产配置、数据或服务。
