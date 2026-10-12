# 海外站点授权候选变更

Status: candidate / not-deployed / pending-independent-QA

新增 `server/src/connectors/overseasBigPlayerSiteSession.js` 与隔离测试。会话严格限定海外 BigPlayer source/account/game/community/board/site 快照，按该链接 gameId/gameVersion/languageId 交换 Token，缓存按完整上下文及基 Token SHA 隔离，失败缓存清理，日志请求 URL 脱敏。

connector 增加显式海外 session 注入点；默认行为、国内及旧 isolatedSiteSession 门禁不变。海外 Token 交换或内容请求拒绝时复用现有最多一次刷新，不新增重试循环。尚未启用真实运行入口。

未改数据库、registry、共享 env、运行服务或算法。评论发现/父链、配置账密与真实消费者排他仍待实现及验收。验证结果随后随候选原始输出交付，不能以本记录宣称采集成功。
