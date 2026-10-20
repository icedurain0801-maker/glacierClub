# 钉钉卡片显示来源平台

Status: local scheduled sender updated

- `worker/src/collectionDingTalk.js` 查询抓取任务时选取 `s.platform`；卡片标题采用“社区 · 平台 · 内容分类”，正文增加“平台：名称”。覆盖紧急告警、关注级和优质内容；BigPlayer/Facebook/Discord/TapTap采用可读名称，缺失平台明确显示未知平台。
- 保持发送资格、今天/昨天范围、昨天补推标注、授权及回执去重逻辑。
- `worker/test/collectionDingTalk.test.js` 验证两平台及三类卡片；34项隔离测试、语法和空白检查通过。
- 对本机计划任务实际使用的 `release-20261020-member-index-dingtalk-r1/worker/src/collectionDingTalk.js` 进行同等最小补丁，已备份原文件并检查运行模板输出与查询平台字段。计划任务下次启动读取新模板，无需重启常驻服务。
- 未重复发群、未触发真实测试发送，已有钉钉消息不回改；不涉及BaaS静态托管或Git推送。
