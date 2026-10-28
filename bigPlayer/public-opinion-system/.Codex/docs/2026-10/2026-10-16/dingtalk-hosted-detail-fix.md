# 钉钉卡片详情链接修复

Status: 已更新发送任务入口，正式详情页面浏览器验收通过。

## 原因与修改

钉钉 `collectionDingTalk.messages()` 将查看链接固定为 `club-opinion.q1.com`。截图中的接收人浏览器报 `DNS_PROBE_FINISHED_NXDOMAIN`，无法解析该地址。

`worker/src/collectionDingTalk.js` 将三类卡片（紧急、关注、社区亮点）共用的详情地址统一为 `https://chat.q1.com/apps/public-opinion/admin/PublicOpinion/content.html`，保留 contentId、communityId、regionCode 和北京时间发布日期参数。登录后仍执行原身份与社区权限校验。

## 验证

- `worker/test/collectionDingTalk.test.js` 新增三类消息的域名、托管路径与参数断言；32 项定向测试通过。
- `node --check worker/src/collectionDingTalk.js` 和定向 `git diff --check` 通过。
- 正式站真实浏览器读取截图帖子 external_id=1605440，作者 ID=5354385，发布时间2026-10-14 18:26:16。
- 使用新卡片同结构的详情地址直接导航，正常 SSO 后自动展开对应内容，确认原文、中文翻译、AI 原因、评论及单条处理区域显示；未点击任何处理或重分析按钮。
- 先前一次浏览器测试提示服务连接失败；本轮正式站社区、列表、详情均正常，无证据表明需要更改数据连接配置。不能据一次成功保证所有接收人的网络状态。
- 证据：`.tests/2026-10/2026-10-16/dingtalk-hosted-detail-tests.txt`、`dingtalk-hosted-detail.png`。

## 运行包与影响

从当前发送包 `release-20261016-recent-backfill-sender-r1` 冻结新包 `C:/ProgramData/PublicOpinion/releases/release-20261016-dingtalk-hosted-detail-r1`。复用原 node_modules，仅定向替换上述 URL，并验证文件内容除此之外完全一致。

Windows 任务 `PublicOpinion BaaS DingTalk Alerts` 的 Action 指向新包；原 Trigger、Principal 和回执数据保持不变。原 Action 备份位于同目录 `dingtalk-hosted-detail-action-backup.json`，恢复其三个字段即可回滚。

未手动执行生产发送、未补推或重发历史消息、未修改回执、未重启 API/Worker、未切换云端查询、未提交或推送 Git。已发送卡片保留原链接，未来任务使用新地址。继续遵守只发送今天/昨天内容及昨日补推标注、去重规则。
