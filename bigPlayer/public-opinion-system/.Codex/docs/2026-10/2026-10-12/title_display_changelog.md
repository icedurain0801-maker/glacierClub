# 帖子与动态标题分类修正

Status: superseded

用户随后明确纠正口径：type=0 为帖子，type=1 为动态，标题不参与分类。本记录为历史变更，已由 raw_type_display_changelog.md 撤回，勿继续按本文件实施。

用户口径：大玩家有标题为帖子，无标题为动态。标题先去除首尾空白；评论仍为评论，其他平台维持既有规则。

原 contentDisplayType 使用 raw_payload.type 数字分类，无法保证与标题规则一致。修改 server/src/services/contentDisplayType.js，让内容管理、概览和内容树共用标题规则；存储 content_type 不变，无数据库迁移、不补采集。更新 server/test/contentDisplayType.test.js 与 server/test/repository.test.js 的分类用例。

实际核对国内超能世界 10/11 全部 148 条非评论记录：6 条有标题帖子，142 条无标题动态。旧规则在这批数据上也全部吻合，因此截图当前页全是动态并不代表没有采到帖子；真实帖子位于后续分页。本次修正保证未来 raw type 与标题冲突时也按标题显示。

发布包 release-20261012-title-display-r1 继承切换前现役 release-20261012-urgent-alert-r4，仅分类函数与 SHA-256 manifest 不同。API4320 短暂重启，旧包和服务 XML 备份保留。未切换前端、Worker，未提交或推送 Git，未发送站内信。

运行包校验沿用原校验器，明确允许基线已有 migrations/032_progressive_risk_severity.sql（只保留文件，不执行迁移），396 文件校验通过；与现役逐文件哈希比较确认只有预期两项变化。

分类 2 项测试和概览 4 项回归通过，node --check 与 git diff --check 通过。初始 node --test 被离线 guard 拒绝子进程，改为直接运行测试文件，guard 无拒绝。页面初次等待 networkidle 超时，改为等待 DOM 与实际列表完成，不改业务逻辑。

验收证据：.tests/2026-10/2026-10-12/title-types-*.json、title-types-unit.txt、title-types-overview.txt 及截图。验收只发 GET/HEAD，不登录、不写库、不启动采集。

边界：帖子/动态下拉沿用当前页筛选，不声称本次实现全量分页前筛选；底层帖子/动态合计仍使用 content_type=post。
