---
last_updated: 2026-10-10
status: awaiting-current-base-unified-candidate
owner: 独立测试负责人
target: https://lfy3001.dev.q1op.com/
---

# 当前基底统一发布：独立最小验收接收范围

经理转达用户明确要求将已完成修复统一发布。QA承担切换前独立验收与上线后限定验收，不执行部署、服务/任务控制、ACL或生产DDL/数据修改。本文件是QA接收范围，不登记经理待办，不构成PASS或切换授权。

## 已确认基底

开发v093/v094只读归档：API为release-20261010-sync-auth-persistence-fix，396文件；前端为release-20261010-sync-auth-v214，34文件。归档manifest SHA805f0d33a886c890fc54392b4052da2d5cfc0cd95c82e79af59d1e019afb6977，API zip SHAfaa76c0a7feb749d12188380b1e0b2b16b566733206475fe5129e700da71ec6b，前端zip SHAef17d2aa564f75d9829a7be54ca4b0399ec2c8a3b871b2964109493fc89caa21。

这些是开发已冻结的归档证据，本接收时点QA仅核读交接，尚未独立重核归档字节或取得新统一候选。v089及v065组合PASS保留为历史结论，不能直接覆盖新API；v087旧login-auth-fix不是本次基底。前端v214不回退到v211或旧sources资源。

## 全量执行项

| 工作项 | 当前状态 |
|---|---|
| 阅读当前新API/前端基底和差异范围 | 完成 |
| 固定接收范围与最小断言 | 完成 |
| 接收新统一manifest、归档来源、受影响源码diff及运行/控制工件 | 未执行：待开发交付 |
| 独立核完整文件集合/SHA、当前基底及批准变化，检验新增重叠 | 未执行：待候选 |
| 核旧writer真实禁止再起、准入/双gate与运行身份证据，签具体准入结论 | 未执行：待实际证据 |
| 上线后限定健康、实际加载及受控功能验收 | 未执行：待切换和精确验收名单 |
| 报告、原件收尾与交接 | 未执行：待验收 |

## 切换前最小检查

1. 新统一候选完整manifest冻结并列每树/脚本/schema/frontend来源SHA。API以当前归档为基底，只补已验writer/helper/错误映射；connector、credentialContext、凭据授权SQL、能力探测复用和当前publicMessages不能回退。v214完整资源和版本引用保留。只审受影响diff，其他树沿已签字节来源，不复跑旧矩阵。
2. 当前API重叠的直接新增断言：合成授权结果持久化及replaceExpireAt语义、账号/来源绑定、能力探测token复用/刷新、能力health和安全错误文案保留；writer安全入队与旧消费入口拒绝。只按最终diff选择最小合成/隔离SQL断言，不重复既有不变用例。
3. 新API→指定analysis/translation的必要组合衔接各一次fake provider。intent/overseas/翻译原已验范围优先以完整字节来源及加载接线继承；确有变化才测直接受影响链路。不触发三站抓取或全面矩阵。
4. 实际控制证据须精确绑定当前服务/任务/人工脚本、PID/createTime/入口/XML或Action身份；明确什么已生效、什么只是方案。任务Disabled不等于manual入口已封禁；Running、磁盘SHA不等于实际loaded。窗口内身份变化必须重新匹配，不能沿旧PID签。
5. 准入/双gate排空、旧入口禁止再起、受保护启动及loaded核对由开发/经理实施并交原件。QA只读核对，不能用离线adapter或候选guard自测代签实际控制。切换前候选部分PASS与发布准入结论分开；新的resident loaded属于切换阶段/之后证据，不能要求它在未启动时凭空存在。

## 上线后限定检查

仅在经理交付明确切换结果和验收名单后检查：目标站点及必要服务健康、当前v214/API身份和实际加载对应关系；批准的精确source/account/community/site/board/window/content/job/版本范围内受控功能一次。健康HTTP200不单独代表同步/入库成功；不因需要证据自行触发抓取、付费AI、认证或通知。若验收确需这类副作用，沿经理的具体批准名单与预算执行，不自行扩项。

按发布影响选择读取已有job/result/cache/intent/audit与受控操作回执，确认功能与当前版本匹配；不复跑三站、旧矩阵或无关功能。失败保留原件，退开发并仅续未过范围。

## 必须保留的未完成边界

接收时点translation归档ACL仍拒读，现役loaded/main无候选一致证明；旧Q1/海外任务在既有只读采样仍Enabled，真实禁止再起未生效；控制器live adapter、双gate真实准入、生产schema/config/名单/cutover和真实定时恢复尚未包含。不得把这些历史观察当未来窗口最新事实，须交时点证据。

用户发布目标明确，但尚未交付新的当前基底统一候选。此前PASS不能代签它；本文件不阻止已可执行的隔离验收，也不以未完成边界扩成无限测试。等待开发交付后执行本范围并回传经理和开发。
