# 评论战斗调侃误报修复

Status: backend-released-verified
Date: 2026-10-16

## 问题和现役核查
浏览器逐条打开6892579、6892291，均属于同一原帖：卡在47—35两个月，换阵容仍未通过，公爵队才神话，咨询是否等超越。两条评论分别为“公爵不行，，公爵打怪没伤害的”“公爵pve没伤害”。现役解释将输出低解读为实际机制异常，其中第一条初判L1被复核提升为告警。
现役分析Worker指向release-20261016-quality-reason-backfill-r1，复核器没有传入原帖，仍仅提交{text}，与工作区已有v14语境复核链路不同。后续已获用户授权更新后端，历史记录不批量更新。

## 修改
- server/src/services/combatDiscussionPolicy.js：统一语义边界，阵容/养成/PVE语境下输出低、刮痧等调侃和强弱讨论为L0；明确不满无故障最多L1；实际技能失效、零伤害结算仍评估L2以上。不是关键词无条件白名单。
- server/src/integrations/typeSafeAnalyzer.js：首轮等级及问题识别使用该规则；policyRevision从3升4，防止复用旧缓存。
- server/src/integrations/typeSafeUrgentReview.js：OpenAI和Anthropic请求均附加同一规则，继续固定gpt-5.6-luna，并使用工作区已有原帖及回复语境链路。

## 验证
17项隔离回归通过：新增3条战斗语境用例、10条语境复核/归属/入库校验、4条两个Worker语境传递与失败重试。语法及git diff --check通过。
新增测试首次因相对require路径多一层失败，修正后17项通过。
真实gpt-5.6-luna仅调用复核接口，不写数据库、不触发通知。浏览器确认两条同属上述原帖；真实结果：两条均L0，hasIssue=false，具体原因解释为角色输出低/强弱讨论；对照“更新后技能命中非免疫怪伤害恒为0连续复现5次普攻正常”为L2。
初次真实调用加载既有环境包含TLS校验关闭项；测试脚本已显式移除该项后重跑成功，最终证据为TLS正常校验的第二次结果。没有修改生产环境配置。
证据：.tests/2026-10/2026-10-16/combat-context-live-review.json。

## 发布与验收
用户授权后端自测后直接上线，只有BaaS静态托管等单独确认。Git不提交、不推送。
三个服务分别从各自现役复制最小补丁，最终运行包后缀combat-context-r3，保留原包回滚。API、采集Worker、分析Worker均Running，进程路径核对为r3；4320和3001健康接口均HTTP200。
候选包各13项模型/校验回归通过，两个Worker各4项队列链路回归通过。浏览器刷新生产域名，评论详情和所属原帖加载正常；不将读取历史结果当作新模型判定验收。
真实数据库无board_id/board_key列，本轮语境归属采用现有raw_payload.boardId比较，并保留来源/账号/社区/祖先关联条件，不迁移数据库。三个候选包逐条只读验证两条评论原帖均available。
真实模型验收发现旧max_tokens请求被Luna接口拒绝，已改OpenAI协议为max_completion_tokens:2400（Anthropic保留max_tokens）；新增参数断言，最终三个真实请求均HTTP200。两条调侃均L0/hasIssue=false，真实零伤害故障对照L2。
最终真实证据：.tests/2026-10/2026-10-16/combat-context-live-review.json。浏览器证据：同目录combat-release-browser.png。
历史两条未自动重判，详情仍展示旧结果；新分析和手动重判使用新规则。BaaS静态托管未发布，Git未提交未推送。
